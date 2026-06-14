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
