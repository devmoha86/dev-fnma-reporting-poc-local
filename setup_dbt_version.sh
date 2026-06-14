#!/usr/bin/env bash
# setup_dbt_version.sh
# Run this once in your Codespace terminal to set up the DuckDB + dbt version.
# Usage: bash setup_dbt_version.sh

set -e
echo "==> Creating directory structure..."
mkdir -p backend/db
mkdir -p backend/dbt_project/models/staging
mkdir -p backend/dbt_project/models/marts
mkdir -p backend/dbt_project/seeds
mkdir -p backend/dbt_project/tests

# ── .gitignore ────────────────────────────────────────────────────────────────
echo "==> Writing .gitignore..."
cat > .gitignore << 'EOF'
# Node.js dependencies and logs
node_modules/
**/node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Python virtual environments and caches
.venv/
venv/
env/
ENV/
**/.venv/
**/venv/
**/__pycache__/
*.py[cod]

# DuckDB generated file (built at runtime by dbt)
backend/db/fnma.duckdb
backend/db/fnma.duckdb.wal

# dbt generated artifacts (not source-controlled — regenerated on each run)
backend/dbt_project/target/
backend/dbt_project/logs/
backend/dbt_project/.user.yml
EOF

# ── requirements.txt ──────────────────────────────────────────────────────────
echo "==> Writing backend/requirements.txt..."
cat > backend/requirements.txt << 'EOF'
--extra-index-url https://nexusrepository.fanniemae.com/nexus/repository/pypi-all/simple/

fastapi==0.115.0
uvicorn[standard]==0.32.0
pandas==2.2.3
duckdb==1.2.2
dbt-core==1.9.4
dbt-duckdb==1.9.2
EOF

# ── backend/startup.py ────────────────────────────────────────────────────────
echo "==> Writing backend/startup.py..."
cat > backend/startup.py << 'EOF'
"""
startup.py — runs dbt seed + dbt run before the FastAPI server starts.

WHY RUN dbt HERE?
  This keeps the architecture self-contained for local dev: a single
  `uvicorn main:app` both refreshes the data warehouse and starts the API.
  In production you'd run dbt in a scheduled pipeline (Airflow, Step Functions)
  and the API would just read — this module would be a no-op.

CALLED FROM: main.py via FastAPI's lifespan hook (startup event).
"""

import subprocess
import sys
import os

DBT_PROJECT_DIR = os.path.join(os.path.dirname(__file__), "dbt_project")


def run_dbt():
    """Run `dbt seed` then `dbt run` in the dbt project directory."""
    print("[dbt] starting dbt build ...")
    for cmd in [["dbt", "seed", "--profiles-dir", "."],
                ["dbt", "run",  "--profiles-dir", "."]]:
        result = subprocess.run(
            cmd,
            cwd=DBT_PROJECT_DIR,
            capture_output=True,
            text=True,
        )
        print(result.stdout)
        if result.returncode != 0:
            print(result.stderr, file=sys.stderr)
            raise RuntimeError(f"dbt command failed: {' '.join(cmd)}")
    print("[dbt] build complete — DuckDB is ready")
EOF

# ── backend/db/__init__.py ────────────────────────────────────────────────────
echo "==> Writing backend/db/__init__.py..."
touch backend/db/__init__.py

# ── backend/db/connection.py ──────────────────────────────────────────────────
echo "==> Writing backend/db/connection.py..."
cat > backend/db/connection.py << 'EOF'
"""
db/connection.py — DuckDB connection singleton.

WHY A SINGLETON?
  DuckDB in "file mode" allows multiple read connections but only one writer
  at a time. Since dbt runs at startup (as a separate process) and then FastAPI
  reads afterward, we open one read-only connection for the life of the process.
  read_only=True prevents accidental writes from API code.

ATHENA SWAP:
  Replace this module with a boto3/pyathena connection. The rest of the API
  code uses execute_query() and never imports duckdb directly, so only this
  file changes.
"""

import duckdb
import os

_DB_PATH = os.path.join(os.path.dirname(__file__), "fnma.duckdb")
_conn: duckdb.DuckDBPyConnection | None = None


def get_connection() -> duckdb.DuckDBPyConnection:
    """Return the shared read-only DuckDB connection, creating it if needed."""
    global _conn
    if _conn is None:
        print(f"[db] opening DuckDB at {_DB_PATH}")
        _conn = duckdb.connect(_DB_PATH, read_only=True)
    return _conn


def execute_query(sql: str, params: list | None = None) -> list[dict]:
    """
    Run a parameterised SQL query and return rows as a list of dicts.

    DuckDB uses $1, $2, ... for positional parameters (same as PostgreSQL),
    which is also valid in Athena's prepared-statement API — so query strings
    are portable.

    Example:
        execute_query(
            "SELECT * FROM mart_kpi_summary WHERE servicer_number = $1",
            ["SVC-001"]
        )
    """
    conn = get_connection()
    rel = conn.execute(sql, params or [])
    cols = [desc[0] for desc in rel.description]
    return [dict(zip(cols, row)) for row in rel.fetchall()]
EOF

# ── backend/main.py ───────────────────────────────────────────────────────────
echo "==> Writing backend/main.py..."
cat > backend/main.py << 'EOF'
"""
Reporting API — backend/main.py
================================
Run:  uvicorn main:app --reload --port 8000
Docs: http://localhost:8000/docs  (auto-generated, interactive)

ARCHITECTURE (v2 — DuckDB + dbt)
  Startup  : dbt seed + dbt run builds/refreshes fnma.duckdb
  Endpoints: query pre-aggregated mart tables via parameterised SQL
  Future   : swap db/connection.py for Athena; SQL queries unchanged

WHY PARAMETERISED QUERIES?
  $1, $2, ... placeholders prevent SQL injection and work identically in
  DuckDB and Athena's prepared-statement API. Never f-string user input into SQL.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from startup import run_dbt
from db.connection import execute_query

# ── Lifespan: runs dbt once at startup, nothing at shutdown ───────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    run_dbt()
    yield

app = FastAPI(title="Servicer Reporting API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

COLOURS = ["#38bdf8", "#818cf8", "#34d399", "#fb923c",
           "#f472b6", "#a78bfa", "#facc15", "#60a5fa"]

SVC_NUM  = Query(None, description="Exact servicer number, e.g. SVC-001")
SVC_NAME = Query(None, description="Servicer name substring, case-insensitive")
START    = Query(None, description="Start date YYYY-MM-DD (inclusive)")
END      = Query(None, description="End date YYYY-MM-DD (inclusive)")


def _filter_clause(
    servicer_number: Optional[str],
    servicer_name: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
) -> tuple[str, list]:
    """
    Build a SQL WHERE clause + positional params list from filter inputs.
    Returns (where_sql, params). where_sql is "" or starts with "WHERE ".
    Positional params use $1, $2, ... — Athena-compatible, injection-safe.
    """
    conditions: list[str] = []
    params: list = []

    if servicer_number:
        params.append(servicer_number)
        conditions.append(f"servicer_number = ${len(params)}")

    if servicer_name:
        params.append(f"%{servicer_name.strip().lower()}%")
        conditions.append(f"LOWER(servicer_name) LIKE ${len(params)}")

    if start_date:
        params.append(start_date)
        conditions.append(f"business_date >= CAST(${len(params)} AS DATE)")

    if end_date:
        params.append(end_date)
        conditions.append(f"business_date <= CAST(${len(params)} AS DATE)")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    return where, params


# ════════════════════════════════════════════════════════════════════════════
# UTILITY ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

@app.get("/health", tags=["utility"])
def health():
    rows = execute_query("SELECT COUNT(*) AS n FROM servicer_metrics")[0]["n"]
    return {"status": "ok", "rows": int(rows), "version": "2.0.0"}


@app.get("/api/filters/servicers", tags=["filters"])
def list_servicers():
    """Unique (servicer_number, servicer_name) pairs for the filter dropdown."""
    rows = execute_query("""
        SELECT DISTINCT servicer_number, servicer_name
        FROM mart_kpi_summary
        ORDER BY servicer_number
    """)
    return {"items": rows, "count": len(rows)}


# ════════════════════════════════════════════════════════════════════════════
# KPI SUMMARY
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/kpi-summary", tags=["charts"])
def kpi_summary(
    servicer_number: Optional[str] = SVC_NUM,
    servicer_name:   Optional[str] = SVC_NAME,
    start_date:      Optional[str] = START,
    end_date:        Optional[str] = END,
):
    """
    Four headline KPI cards + status counts, as of the latest business_date.
    SQL PATTERN: filter → MAX(date) → snapshot → aggregate.
    """
    where, params = _filter_clause(servicer_number, servicer_name, start_date, end_date)

    latest_rows = execute_query(
        f"SELECT MAX(business_date) AS latest FROM mart_kpi_summary {where}", params
    )
    latest = latest_rows[0]["latest"]
    if latest is None:
        return {"total_loans": 0, "avg_delinquency_rate": 0,
                "total_balance_usd": 0, "servicer_count": 0,
                "status_counts": {"GREEN": 0, "YELLOW": 0, "RED": 0}}

    snap_params = params + [str(latest)]
    snap_where = (where + " AND " if where else "WHERE ") + f"business_date = ${len(snap_params)}"

    agg = execute_query(f"""
        SELECT
            SUM(loan_count)                    AS total_loans,
            AVG(delinquency_rate_pct)          AS avg_delinquency_rate,
            SUM(balance_usd_millions)          AS total_balance_usd,
            COUNT(DISTINCT servicer_number)    AS servicer_count
        FROM mart_kpi_summary
        {snap_where}
    """, snap_params)[0]

    status_rows = execute_query(f"""
        SELECT metric_status, COUNT(DISTINCT servicer_number) AS cnt
        FROM mart_kpi_summary
        {snap_where}
        GROUP BY metric_status
    """, snap_params)

    status_counts = {r["metric_status"]: int(r["cnt"]) for r in status_rows}
    for s in ["GREEN", "YELLOW", "RED"]:
        status_counts.setdefault(s, 0)

    return {
        "total_loans":          int(agg["total_loans"] or 0),
        "avg_delinquency_rate": round(float(agg["avg_delinquency_rate"] or 0), 2),
        "total_balance_usd":    round(float(agg["total_balance_usd"] or 0), 1),
        "servicer_count":       int(agg["servicer_count"] or 0),
        "status_counts":        status_counts,
        "as_of_date":           str(latest),
    }


# ════════════════════════════════════════════════════════════════════════════
# CHART 1 — Delinquency Rate Trend  (LINE chart)
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/charts/delinquency-trend", tags=["charts"])
def delinquency_trend(
    servicer_number: Optional[str] = SVC_NUM,
    servicer_name:   Optional[str] = SVC_NAME,
    start_date:      Optional[str] = START,
    end_date:        Optional[str] = END,
):
    where, params = _filter_clause(servicer_number, servicer_name, start_date, end_date)
    rows = execute_query(f"""
        SELECT servicer_number, servicer_name, business_date, delinquency_rate_pct
        FROM mart_delinquency_trend
        {where}
        ORDER BY servicer_number, business_date
    """, params)

    servicers: dict[str, dict] = {}
    for row in rows:
        svc = row["servicer_number"]
        if svc not in servicers:
            servicers[svc] = {"name": row["servicer_name"], "dates": [], "rates": []}
        servicers[svc]["dates"].append(str(row["business_date"]))
        servicers[svc]["rates"].append(round(float(row["delinquency_rate_pct"]), 3))

    traces = [
        {
            "type":   "scatter",
            "mode":   "lines+markers",
            "name":   f"{svc} — {data['name']}",
            "x":      data["dates"],
            "y":      data["rates"],
            "line":   {"color": COLOURS[i % len(COLOURS)], "width": 2.5},
            "marker": {"size": 6},
        }
        for i, (svc, data) in enumerate(servicers.items())
    ]

    return {
        "chartType": "line",
        "title":     "Delinquency Rate Trend (%)",
        "traces":    traces,
        "layout": {
            "xaxis":         {"title": "Date", "gridcolor": "#1e293b"},
            "yaxis":         {"title": "Rate (%)", "gridcolor": "#1e293b", "rangemode": "tozero"},
            "legend":        {"orientation": "h", "y": -0.25},
            "paper_bgcolor": "transparent",
            "plot_bgcolor":  "transparent",
            "font":          {"color": "#dce8f7"},
            "margin":        {"t": 30, "r": 16, "b": 80, "l": 52},
        },
    }


# ════════════════════════════════════════════════════════════════════════════
# CHART 2 — Loan Count by Region  (BAR chart, grouped)
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/charts/loan-by-region", tags=["charts"])
def loan_by_region(
    servicer_number: Optional[str] = SVC_NUM,
    servicer_name:   Optional[str] = SVC_NAME,
    start_date:      Optional[str] = START,
    end_date:        Optional[str] = END,
):
    where, params = _filter_clause(servicer_number, servicer_name, start_date, end_date)
    rows = execute_query(f"""
        SELECT region, servicer_number, servicer_name, SUM(loan_count) AS loan_count
        FROM mart_loan_by_region
        {where}
        GROUP BY region, servicer_number, servicer_name
        ORDER BY region, servicer_number
    """, params)

    servicers: dict[str, dict] = {}
    for row in rows:
        svc = row["servicer_number"]
        if svc not in servicers:
            servicers[svc] = {"name": row["servicer_name"], "regions": [], "counts": []}
        servicers[svc]["regions"].append(row["region"])
        servicers[svc]["counts"].append(int(row["loan_count"]))

    traces = [
        {
            "type":   "bar",
            "name":   f"{svc} — {data['name']}",
            "x":      data["regions"],
            "y":      data["counts"],
            "marker": {"color": COLOURS[i % len(COLOURS)]},
        }
        for i, (svc, data) in enumerate(servicers.items())
    ]

    return {
        "chartType": "bar",
        "title":     "Loan Count by Region & Servicer",
        "traces":    traces,
        "layout": {
            "barmode":       "group",
            "xaxis":         {"title": "Region", "gridcolor": "#1e293b"},
            "yaxis":         {"title": "Total Loans", "gridcolor": "#1e293b"},
            "legend":        {"orientation": "h", "y": -0.25},
            "paper_bgcolor": "transparent",
            "plot_bgcolor":  "transparent",
            "font":          {"color": "#dce8f7"},
            "margin":        {"t": 30, "r": 16, "b": 80, "l": 52},
        },
    }


# ════════════════════════════════════════════════════════════════════════════
# CHART 3 — Portfolio Balance by Servicer  (horizontal BAR)
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/charts/portfolio-balance", tags=["charts"])
def portfolio_balance(
    servicer_number: Optional[str] = SVC_NUM,
    servicer_name:   Optional[str] = SVC_NAME,
    start_date:      Optional[str] = START,
    end_date:        Optional[str] = END,
):
    where, params = _filter_clause(servicer_number, servicer_name, start_date, end_date)

    latest_rows = execute_query(
        f"SELECT MAX(business_date) AS latest FROM mart_portfolio_balance {where}", params
    )
    latest = latest_rows[0]["latest"]
    if not latest:
        return {"chartType": "bar", "title": "Portfolio Balance", "traces": [], "layout": {}}

    snap_params = params + [str(latest)]
    snap_where = (where + " AND " if where else "WHERE ") + f"business_date = ${len(snap_params)}"

    rows = execute_query(f"""
        SELECT servicer_number, servicer_name, balance_usd_millions
        FROM mart_portfolio_balance
        {snap_where}
        ORDER BY balance_usd_millions ASC
    """, snap_params)

    labels = [f"{r['servicer_number']} — {r['servicer_name']}" for r in rows]
    values = [round(float(r["balance_usd_millions"]), 1) for r in rows]

    return {
        "chartType": "bar",
        "title":     f"Portfolio Balance — USD Millions (as of {latest})",
        "traces": [{
            "type":         "bar",
            "orientation":  "h",
            "x":            values,
            "y":            labels,
            "marker":       {"color": COLOURS[:len(labels)]},
            "text":         [f"${v}M" for v in values],
            "textposition": "auto",
            "textfont":     {"color": "#dce8f7"},
        }],
        "layout": {
            "xaxis":         {"title": "Balance (USD M)", "gridcolor": "#1e293b"},
            "yaxis":         {"gridcolor": "#1e293b"},
            "paper_bgcolor": "transparent",
            "plot_bgcolor":  "transparent",
            "font":          {"color": "#dce8f7"},
            "margin":        {"t": 30, "r": 16, "b": 52, "l": 200},
        },
    }


# ════════════════════════════════════════════════════════════════════════════
# CHART 4 — Metric Status Distribution  (PIE / donut)
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/charts/status-distribution", tags=["charts"])
def status_distribution(
    servicer_number: Optional[str] = SVC_NUM,
    servicer_name:   Optional[str] = SVC_NAME,
    start_date:      Optional[str] = START,
    end_date:        Optional[str] = END,
):
    where, params = _filter_clause(servicer_number, servicer_name, start_date, end_date)

    latest_rows = execute_query(
        f"SELECT MAX(business_date) AS latest FROM mart_status_distribution {where}", params
    )
    latest = latest_rows[0]["latest"]
    if not latest:
        return {"chartType": "pie", "title": "Status Distribution", "traces": [], "layout": {}}

    snap_params = params + [str(latest)]
    snap_where = (where + " AND " if where else "WHERE ") + f"business_date = ${len(snap_params)}"

    rows = execute_query(f"""
        SELECT metric_status, SUM(servicer_count) AS cnt
        FROM mart_status_distribution
        {snap_where}
        GROUP BY metric_status
        ORDER BY metric_status
    """, snap_params)

    color_map = {"GREEN": "#10b981", "YELLOW": "#f59e0b", "RED": "#ef4444"}
    labels  = [r["metric_status"] for r in rows]
    values  = [int(r["cnt"]) for r in rows]
    colours = [color_map.get(s, "#94a3b8") for s in labels]

    return {
        "chartType": "pie",
        "title":     f"Servicer Status Distribution (as of {latest})",
        "traces": [{
            "type":     "pie",
            "hole":     0.55,
            "labels":   labels,
            "values":   values,
            "marker":   {"colors": colours},
            "textinfo": "label+percent",
            "textfont": {"color": "#dce8f7", "size": 13},
        }],
        "layout": {
            "paper_bgcolor": "transparent",
            "plot_bgcolor":  "transparent",
            "font":          {"color": "#dce8f7"},
            "legend":        {"orientation": "h", "y": -0.1},
            "margin":        {"t": 30, "r": 16, "b": 60, "l": 16},
        },
    }
EOF

# ── dbt_project.yml ───────────────────────────────────────────────────────────
echo "==> Writing backend/dbt_project/dbt_project.yml..."
cat > backend/dbt_project/dbt_project.yml << 'EOF'
name: fnma_reporting
version: "1.0.0"
config-version: 2

profile: fnma_local

model-paths: ["models"]
seed-paths:  ["seeds"]
test-paths:  ["tests"]

models:
  fnma_reporting:
    staging:
      +materialized: view
    marts:
      +materialized: table

seeds:
  fnma_reporting:
    servicer_metrics:
      +column_types:
        unique_id:          integer
        delinquency_rate:   double
        total_balance_usd:  double
        loan_count:         integer
        business_date:      date
EOF

# ── profiles.yml ──────────────────────────────────────────────────────────────
echo "==> Writing backend/dbt_project/profiles.yml..."
cat > backend/dbt_project/profiles.yml << 'EOF'
# LOCAL: dbt-duckdb writes to backend/db/fnma.duckdb
# PROD:  add fnma_prod block pointing at Athena — models unchanged

fnma_local:
  target: duckdb
  outputs:
    duckdb:
      type: duckdb
      path: "../db/fnma.duckdb"
      threads: 4
EOF

# ── seed CSV ──────────────────────────────────────────────────────────────────
echo "==> Writing backend/dbt_project/seeds/servicer_metrics.csv..."
cat > backend/dbt_project/seeds/servicer_metrics.csv << 'EOF'
unique_id,servicer_number,servicer_name,tenant_id,business_date,region,loan_count,delinquency_rate,total_balance_usd,metric_status
1001,SVC-001,Apex Mortgage Services,tenant-a,2026-04-01,NORTH,1240,0.032,184500000.00,GREEN
1002,SVC-001,Apex Mortgage Services,tenant-a,2026-04-02,NORTH,1248,0.034,185100000.00,GREEN
1003,SVC-001,Apex Mortgage Services,tenant-a,2026-04-03,NORTH,1251,0.036,185920000.00,YELLOW
1004,SVC-002,Beacon Loan Servicing,tenant-a,2026-04-01,SOUTH,890,0.041,121300000.00,YELLOW
1005,SVC-002,Beacon Loan Servicing,tenant-a,2026-04-02,SOUTH,892,0.043,121800000.00,YELLOW
1006,SVC-002,Beacon Loan Servicing,tenant-a,2026-04-03,SOUTH,895,0.045,122050000.00,RED
1007,SVC-003,Cardinal Servicing Group,tenant-b,2026-04-01,EAST,2105,0.021,302400000.00,GREEN
1008,SVC-003,Cardinal Servicing Group,tenant-b,2026-04-02,EAST,2112,0.022,303100000.00,GREEN
1009,SVC-003,Cardinal Servicing Group,tenant-b,2026-04-03,EAST,2118,0.023,303900000.00,GREEN
1010,SVC-004,Delta Financial Partners,tenant-b,2026-04-01,WEST,1567,0.029,221800000.00,GREEN
1011,SVC-004,Delta Financial Partners,tenant-b,2026-04-02,WEST,1571,0.030,222400000.00,GREEN
1012,SVC-004,Delta Financial Partners,tenant-b,2026-04-03,WEST,1574,0.031,223000000.00,GREEN
1013,SVC-005,Evergreen Capital Servicing,tenant-c,2026-04-01,NORTH,743,0.052,98700000.00,RED
1014,SVC-005,Evergreen Capital Servicing,tenant-c,2026-04-02,NORTH,741,0.054,98500000.00,RED
1015,SVC-005,Evergreen Capital Servicing,tenant-c,2026-04-03,NORTH,739,0.055,98300000.00,RED
1016,SVC-006,Fortis Home Loans,tenant-c,2026-04-01,SOUTH,1820,0.027,258900000.00,GREEN
1017,SVC-006,Fortis Home Loans,tenant-c,2026-04-02,SOUTH,1825,0.028,259400000.00,GREEN
1018,SVC-006,Fortis Home Loans,tenant-c,2026-04-03,SOUTH,1829,0.029,259900000.00,YELLOW
1019,SVC-007,Granite Mortgage Co,tenant-a,2026-04-01,EAST,995,0.038,140200000.00,YELLOW
1020,SVC-007,Granite Mortgage Co,tenant-a,2026-04-02,EAST,998,0.039,140600000.00,YELLOW
1021,SVC-007,Granite Mortgage Co,tenant-a,2026-04-03,EAST,1001,0.040,141100000.00,YELLOW
1022,SVC-008,Horizon Lending Services,tenant-b,2026-04-01,WEST,1340,0.025,189700000.00,GREEN
1023,SVC-008,Horizon Lending Services,tenant-b,2026-04-02,WEST,1344,0.026,190200000.00,GREEN
1024,SVC-008,Horizon Lending Services,tenant-b,2026-04-03,WEST,1348,0.027,190700000.00,GREEN
EOF

# ── staging model ─────────────────────────────────────────────────────────────
echo "==> Writing staging model..."
cat > backend/dbt_project/models/staging/stg_servicer_metrics.sql << 'EOF'
-- Staging: clean types + derive display-ready columns.
-- All mart models SELECT from this view, never from the raw seed.
SELECT
    unique_id,
    servicer_number,
    servicer_name,
    tenant_id,
    CAST(business_date AS DATE)                        AS business_date,
    region,
    CAST(loan_count AS INTEGER)                        AS loan_count,
    CAST(delinquency_rate AS DOUBLE)                   AS delinquency_rate,
    ROUND(CAST(delinquency_rate AS DOUBLE) * 100, 3)   AS delinquency_rate_pct,
    CAST(total_balance_usd AS DOUBLE)                  AS total_balance_usd,
    ROUND(CAST(total_balance_usd AS DOUBLE) / 1e6, 1)  AS balance_usd_millions,
    metric_status
FROM {{ ref('servicer_metrics') }}
EOF

cat > backend/dbt_project/models/staging/schema.yml << 'EOF'
version: 2
models:
  - name: stg_servicer_metrics
    description: >
      Cleaned view over the raw servicer_metrics seed. One row per
      (servicer_number, business_date, region). All types are cast and
      two derived columns are added for display convenience.
    columns:
      - name: servicer_number
        description: "Business key for a servicer, e.g. SVC-001."
      - name: servicer_name
        description: "Human-readable servicer name."
      - name: business_date
        description: Reporting date (DATE, YYYY-MM-DD).
      - name: region
        description: "Geographic region: NORTH, SOUTH, EAST, or WEST."
      - name: loan_count
        description: Number of active loans on this date.
      - name: delinquency_rate_pct
        description: Delinquency rate as a percentage (3.2 = 3.2%). Use for display.
      - name: balance_usd_millions
        description: Portfolio balance in USD millions. Use for display.
      - name: metric_status
        description: "Risk signal: GREEN (healthy), YELLOW (watch), RED (at-risk)."
EOF

# ── mart models ───────────────────────────────────────────────────────────────
echo "==> Writing mart models..."

cat > backend/dbt_project/models/marts/mart_kpi_summary.sql << 'EOF'
-- Powers: GET /api/kpi-summary
-- Grain:  one row per (servicer_number, business_date)
SELECT
    servicer_number, servicer_name, business_date, region,
    loan_count, delinquency_rate, delinquency_rate_pct,
    total_balance_usd, balance_usd_millions, metric_status
FROM {{ ref('stg_servicer_metrics') }}
ORDER BY business_date, servicer_number
EOF

cat > backend/dbt_project/models/marts/mart_delinquency_trend.sql << 'EOF'
-- Powers: GET /api/charts/delinquency-trend
-- Grain:  one row per (servicer_number, business_date)
SELECT servicer_number, servicer_name, business_date, delinquency_rate_pct
FROM {{ ref('stg_servicer_metrics') }}
ORDER BY servicer_number, business_date
EOF

cat > backend/dbt_project/models/marts/mart_loan_by_region.sql << 'EOF'
-- Powers: GET /api/charts/loan-by-region
-- Grain:  one row per (region, servicer_number, business_date)
SELECT
    region, servicer_number, servicer_name, business_date,
    SUM(loan_count) AS loan_count
FROM {{ ref('stg_servicer_metrics') }}
GROUP BY region, servicer_number, servicer_name, business_date
ORDER BY region, servicer_number, business_date
EOF

cat > backend/dbt_project/models/marts/mart_portfolio_balance.sql << 'EOF'
-- Powers: GET /api/charts/portfolio-balance
-- Grain:  one row per (servicer_number, business_date)
SELECT
    servicer_number, servicer_name, business_date,
    SUM(total_balance_usd)    AS total_balance_usd,
    SUM(balance_usd_millions) AS balance_usd_millions
FROM {{ ref('stg_servicer_metrics') }}
GROUP BY servicer_number, servicer_name, business_date
ORDER BY business_date, balance_usd_millions
EOF

cat > backend/dbt_project/models/marts/mart_status_distribution.sql << 'EOF'
-- Powers: GET /api/charts/status-distribution
-- Grain:  one row per (metric_status, business_date)
SELECT
    metric_status, business_date,
    COUNT(DISTINCT servicer_number) AS servicer_count
FROM {{ ref('stg_servicer_metrics') }}
GROUP BY metric_status, business_date
ORDER BY business_date, metric_status
EOF

cat > backend/dbt_project/models/marts/schema.yml << 'EOF'
version: 2

# schema.yml is the dbt metadata layer used for:
#   1. Automated data-quality tests (not_null, accepted_values)
#   2. LLM context injection for the NLQ endpoint — the model reads these
#      descriptions to understand which table/column to query
#   3. Future data catalogue tools (Atlan, DataHub)

models:
  - name: mart_kpi_summary
    description: >
      One row per (servicer_number, business_date). Powers the four KPI
      headline cards. Filter by business_date for a snapshot.
    columns:
      - name: servicer_number
        description: Business key for the servicer (e.g. SVC-001).
        tests: [not_null]
      - name: business_date
        description: Reporting date (DATE).
        tests: [not_null]
      - name: loan_count
        description: Total active loans on this date.
      - name: delinquency_rate_pct
        description: Delinquency rate as a percentage (e.g. 3.2 means 3.2%).
      - name: balance_usd_millions
        description: Portfolio balance in USD millions.
      - name: metric_status
        description: "Risk classification: GREEN, YELLOW, or RED."
        tests:
          - accepted_values:
              values: ["GREEN", "YELLOW", "RED"]

  - name: mart_delinquency_trend
    description: One row per (servicer_number, business_date) for the trend line chart.
    columns:
      - name: servicer_number
        tests: [not_null]
      - name: business_date
        tests: [not_null]
      - name: delinquency_rate_pct
        description: Delinquency rate percentage on this date.

  - name: mart_loan_by_region
    description: One row per (region, servicer_number, business_date). Aggregated loan counts.
    columns:
      - name: region
        description: "Geographic region: NORTH, SOUTH, EAST, WEST."
        tests: [not_null]
      - name: servicer_number
        tests: [not_null]
      - name: loan_count
        description: Total loans for this servicer in this region on this date.

  - name: mart_portfolio_balance
    description: >
      One row per (servicer_number, business_date). Filter to MAX(business_date)
      for the current snapshot.
    columns:
      - name: servicer_number
        tests: [not_null]
      - name: business_date
        tests: [not_null]
      - name: balance_usd_millions
        description: Total portfolio balance in USD millions.

  - name: mart_status_distribution
    description: >
      One row per (metric_status, business_date). Count of servicers per risk
      category per day. Filter to MAX(business_date) for the donut chart.
    columns:
      - name: metric_status
        description: "Risk classification: GREEN, YELLOW, or RED."
        tests:
          - not_null
          - accepted_values:
              values: ["GREEN", "YELLOW", "RED"]
      - name: business_date
        tests: [not_null]
      - name: servicer_count
        description: Number of distinct servicers with this status on this date.
EOF

# ── Install deps + run dbt ────────────────────────────────────────────────────
echo ""
echo "==> Installing Python dependencies..."
pip install duckdb==1.2.2 dbt-core==1.9.4 dbt-duckdb==1.9.2 --quiet

echo ""
echo "==> Running dbt seed + dbt run..."
cd backend/dbt_project
dbt seed --profiles-dir .
dbt run  --profiles-dir .
dbt test --profiles-dir .
cd ../..

# ── Commit ────────────────────────────────────────────────────────────────────
echo ""
echo "==> Committing to fnma-local-dbt-version..."
git add -A
git commit -m "feat: replace pandas/CSV engine with DuckDB + dbt semantic layer"
git push origin fnma-local-dbt-version

echo ""
echo "✓ Done! Start the API with:"
echo "  cd backend && uvicorn main:app --reload --port 8000"
