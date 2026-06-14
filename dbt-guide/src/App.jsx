import { useState, useRef, useEffect } from "react";

const T = {
  bg: '#080F1C', surface: '#0F1E35', hi: '#162840',
  border: '#1E3A5F', accent: '#00D4FF', text: '#E2EAF8',
  muted: '#5B7A9C', dim: '#2A3F5A',
  dbt: '#FF6B35', duck: '#FDCA40', athena: '#8B5CF6',
  green: '#10B981', warn: '#F59E0B', red: '#EF4444',
};

// ─── Code block ──────────────────────────────────────────────────────────────
const Code = ({ children, lang = '' }) => (
  <div style={{ background:'#04080F', border:`1px solid ${T.border}`, borderRadius:8,
    padding:'14px 16px', margin:'10px 0', position:'relative', overflowX:'auto' }}>
    {lang && <span style={{ position:'absolute', top:8, right:12, fontSize:10,
      color:T.muted, textTransform:'uppercase', letterSpacing:'0.1em' }}>{lang}</span>}
    <pre style={{ margin:0, fontFamily:"'JetBrains Mono','Fira Code',monospace",
      fontSize:12.5, color:'#B8D0F0', lineHeight:1.75, whiteSpace:'pre-wrap' }}>{children}</pre>
  </div>
);

// ─── Diff block (before / after) ─────────────────────────────────────────────
const Diff = ({ label, before, after, beforeLang='python', afterLang='python' }) => (
  <div style={{ marginBottom:16 }}>
    <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase',
      letterSpacing:'0.12em', marginBottom:8 }}>{label}</div>
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
      <div>
        <div style={{ fontSize:11, color:T.red, fontWeight:700, marginBottom:4 }}>❌ Before</div>
        <Code lang={beforeLang}>{before}</Code>
      </div>
      <div>
        <div style={{ fontSize:11, color:T.green, fontWeight:700, marginBottom:4 }}>✅ After</div>
        <Code lang={afterLang}>{after}</Code>
      </div>
    </div>
  </div>
);

// ─── Info card ─────────────────────────────────────────────────────────────
const Info = ({ color = T.accent, icon = 'ℹ', children }) => (
  <div style={{ background:`${color}10`, border:`1px solid ${color}33`,
    borderLeft:`3px solid ${color}`, borderRadius:'0 8px 8px 0',
    padding:'12px 16px', margin:'12px 0', fontSize:13, color:T.text, lineHeight:1.7 }}>
    <span style={{ color, marginRight:8 }}>{icon}</span>{children}
  </div>
);

// ─── Pipeline phase bar ────────────────────────────────────────────────────
const Pipeline = ({ activeStep }) => {
  const phases = [
    { label:'PoC', sub:'CSV + Pandas', steps:[0,1], color:T.red },
    { label:'Now', sub:'DuckDB + dbt', steps:[2,3,4,5,6], color:T.duck },
    { label:'Prod', sub:'S3 + Athena', steps:[7], color:T.athena },
  ];
  return (
    <div style={{ display:'flex', gap:8, marginBottom:24 }}>
      {phases.map((p,i) => {
        const active = p.steps.some(s => s === activeStep);
        return (
          <div key={i} style={{ flex:1, padding:'10px 14px', borderRadius:8,
            background: active ? `${p.color}18` : T.surface,
            border:`1px solid ${active ? p.color+'66' : T.border}`,
            boxShadow: active ? `0 0 14px ${p.color}22` : 'none',
            transition:'all 0.2s', textAlign:'center' }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700,
              fontSize:13, color: active ? p.color : T.muted }}>{p.label}</div>
            <div style={{ fontSize:11, color:T.muted, marginTop:3 }}>{p.sub}</div>
          </div>
        );
      })}
    </div>
  );
};

// ─── STEPS ────────────────────────────────────────────────────────────────────
const steps = [
  // STEP 0
  { title:'The PoC: CSV + Pandas', icon:'📄', phase:'poc',
    render: () => (
      <div>
        <p style={{ fontSize:14, color:T.muted, lineHeight:1.8, marginBottom:16 }}>
          Your PoC loaded raw CSV files into Pandas DataFrames at startup. Every API request
          re-ran Python aggregations. This worked perfectly on a laptop — but has serious
          limitations for 2,000+ concurrent users.
        </p>
        <Code lang="python">{`# OLD: backend/rejected_events.py (PoC pattern)

import pandas as pd

# Load entire CSV into memory at startup
RE_DF = pd.read_csv("data/rejected_events.csv")

@app.get("/api/rejected-events/by-servicer")
def get_rejected_events(servicer_id: str = None):
    filtered_df = RE_DF.copy()               # copy entire DataFrame
    if servicer_id:
        filtered_df = filtered_df[filtered_df["servicer_id"] == servicer_id]

    # Business logic mixed into API handler
    rows = []
    grouped = filtered_df.groupby("servicer_id")
    for svc_id, group in grouped:
        outstanding = int((group["status"] == "Outstanding").sum())
        rejected    = int(group["loan_id"].nunique())
        pct         = round(outstanding / len(RE_DF) * 100, 2)
        rows.append({
            "servicer_id": svc_id,
            "outstanding_rejected_events": outstanding,
            "rejected_loans": rejected,
            "pct_of_total_delinquent": pct,
        })
    return rows`}</Code>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, margin:'16px 0' }}>
          {[
            { label:'Problem 1', color:T.red, text:'Full CSV loaded into RAM on startup. With real data (millions of rows), this crashes.' },
            { label:'Problem 2', color:T.red, text:'Every request re-runs groupby(). At 2,000+ concurrent users, Python becomes the bottleneck.' },
            { label:'Problem 3', color:T.warn, text:'Business logic (pct = outstanding / total) lives in FastAPI, not the database. No reuse.' },
            { label:'Problem 4', color:T.warn, text:'No data quality tests. Wrong data silently flows to charts.' },
          ].map((c,i) => (
            <div key={i} style={{ padding:'12px 14px', background:T.hi, borderRadius:8,
              border:`1px solid ${c.color}33`, borderLeft:`3px solid ${c.color}` }}>
              <div style={{ fontSize:11, fontWeight:700, color:c.color, marginBottom:4 }}>{c.label}</div>
              <div style={{ fontSize:12.5, color:T.muted, lineHeight:1.6 }}>{c.text}</div>
            </div>
          ))}
        </div>
      </div>
    )
  },

  // STEP 1
  { title:'What needed to change', icon:'🔄', phase:'poc',
    render: () => (
      <div>
        <p style={{ fontSize:14, color:T.muted, lineHeight:1.8, marginBottom:16 }}>
          The fix: move aggregations <strong style={{color:T.text}}>into the database</strong> and
          let FastAPI become a thin HTTP layer. The database handles scale; FastAPI just reads results.
        </p>
        <div style={{ background:T.hi, borderRadius:10, padding:20, marginBottom:20,
          fontFamily:"'JetBrains Mono',monospace", fontSize:12, lineHeight:2.2 }}>
          <div style={{ color:T.red }}>── PoC (what we had) ──────────────────────────</div>
          <div style={{ paddingLeft:16, color:T.muted }}>
            CSV file → <span style={{color:T.red}}>Pandas (aggregation in Python)</span> → FastAPI → Angular
          </div>
          <br/>
          <div style={{ color:T.green }}>── New architecture (what we built) ────────────</div>
          <div style={{ paddingLeft:16, color:T.muted }}>
            CSV seed → <span style={{color:T.dbt}}>dbt (SQL models)</span> → DuckDB file → FastAPI → Angular
          </div>
          <br/>
          <div style={{ color:T.athena }}>── Production (where this goes) ───────────────</div>
          <div style={{ paddingLeft:16, color:T.muted }}>
            S3 Parquet → <span style={{color:T.athena}}>dbt (same SQL models)</span> → Athena → FastAPI → Angular
          </div>
        </div>
        <Info color={T.accent} icon="💡">
          <strong>Key insight:</strong> The dbt SQL models are written once and work identically
          against DuckDB locally and Athena in AWS production. You only change the adapter (one config file).
          FastAPI endpoints, Angular, and all business logic stay unchanged.
        </Info>
        <div style={{ marginTop:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase',
            letterSpacing:'0.12em', marginBottom:10 }}>Files that changed</div>
          {[
            ['requirements.txt', 'Added dbt-core, dbt-duckdb, duckdb', T.green],
            ['backend/startup.py', 'NEW — runs dbt at FastAPI startup', T.green],
            ['backend/db/connection.py', 'NEW — DuckDB singleton (swap point for Athena)', T.green],
            ['backend/main.py', 'Rewrote endpoints: Pandas → SQL via execute_query()', T.green],
            ['backend/dbt_project/**', 'NEW — all SQL models, seeds, schema docs', T.green],
            ['backend/rejected_events.py', 'REMOVED — logic moved into dbt models', T.red],
          ].map(([file, desc, color], i) => (
            <div key={i} style={{ display:'flex', gap:12, alignItems:'flex-start',
              padding:'8px 0', borderBottom:`1px solid ${T.border}22` }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11,
                color, flexShrink:0, minWidth:160 }}>{file}</span>
              <span style={{ fontSize:12.5, color:T.muted }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },

  // STEP 2
  { title:'dbt concepts: seeds → staging → marts', icon:'🌱', phase:'dbt',
    render: () => (
      <div>
        <p style={{ fontSize:14, color:T.muted, lineHeight:1.8, marginBottom:16 }}>
          dbt organises SQL into three layers. Each layer builds on the previous. 
          Think of it as a pipeline where raw data gets progressively refined.
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
          {[
            { num:'1', color:T.duck, label:'Seeds', sub:'dbt_project/seeds/', 
              text:'Raw CSV data loaded into the database. Replaces manually loading CSVs into Pandas. In production, seeds are replaced by S3/Glue tables (you don\'t run seeds in prod).',
              code:`# seeds/servicer_metrics.csv — raw data
unique_id,servicer_number,servicer_name,business_date,loan_count,...
1001,SVC-001,Apex Mortgage Services,2026-04-01,1240,...` },
            { num:'2', color:T.dbt, label:'Staging models', sub:'models/staging/stg_*.sql',
              text:'Clean and cast raw seed data. Fix types. Add derived columns. Never aggregate here — just clean. Every mart reads from staging, never from seeds directly.',
              code:`-- models/staging/stg_servicer_metrics.sql
SELECT
    servicer_number,
    CAST(business_date AS DATE)               AS business_date,
    CAST(loan_count AS INTEGER)               AS loan_count,
    ROUND(delinquency_rate * 100, 3)          AS delinquency_rate_pct, -- derived!
    ROUND(total_balance_usd / 1e6, 1)         AS balance_usd_millions   -- derived!
FROM {{ ref('servicer_metrics') }}` },
            { num:'3', color:T.accent, label:'Mart models', sub:'models/marts/mart_*.sql',
              text:'Pre-aggregated views that FastAPI reads. Each mart powers one endpoint. Business logic lives HERE — not in Python. FastAPI endpoints become simple SELECT statements.',
              code:`-- models/marts/mart_kpi_summary.sql
SELECT servicer_number, servicer_name, business_date,
       loan_count, delinquency_rate_pct, balance_usd_millions,
       metric_status
FROM {{ ref('stg_servicer_metrics') }}
ORDER BY business_date, servicer_number` },
          ].map((layer,i) => (
            <div key={i} style={{ padding:'14px 16px', background:T.hi, borderRadius:8,
              border:`1px solid ${layer.color}33`, borderLeft:`3px solid ${layer.color}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <div style={{ width:24, height:24, borderRadius:'50%',
                  background:`${layer.color}22`, border:`1px solid ${layer.color}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color:layer.color, fontSize:11, fontWeight:700 }}>{layer.num}</div>
                <div style={{ color:layer.color, fontWeight:700, fontSize:14 }}>{layer.label}</div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:T.muted }}>{layer.sub}</div>
              </div>
              <div style={{ fontSize:13, color:T.muted, lineHeight:1.6, marginBottom:8 }}>{layer.text}</div>
              <Code lang="sql">{layer.code}</Code>
            </div>
          ))}
        </div>
        <Info color={T.dbt} icon="🔁">
          <code style={{color:T.text}}>{'{{ ref("stg_servicer_metrics") }}'}</code> is dbt's way of referencing another model.
          It handles dependency ordering automatically — dbt always runs staging before marts.
          At runtime this resolves to the actual table/view name in your database.
        </Info>
      </div>
    )
  },

  // STEP 3
  { title:'db/connection.py — the swap point', icon:'🔌', phase:'dbt',
    render: () => (
      <div>
        <p style={{ fontSize:14, color:T.muted, lineHeight:1.8, marginBottom:16 }}>
          This single file is <strong style={{color:T.text}}>the entire production migration</strong>.
          Everything in FastAPI calls <code style={{color:T.accent}}>execute_query()</code>.
          When you swap this file, the whole API switches from DuckDB to Athena.
        </p>
        <Code lang="python">{`# backend/db/connection.py  (current: DuckDB)

import duckdb, os

_DB_PATH = os.path.join(os.path.dirname(__file__), "fnma.duckdb")
_conn = None

def get_connection():
    global _conn
    if _conn is None:
        _conn = duckdb.connect(_DB_PATH, read_only=True)
    return _conn

def execute_query(sql: str, params: list = None) -> list[dict]:
    """
    WHY read_only=True?
    dbt runs at startup as a separate process (dbt run).
    FastAPI only needs to READ the mart tables it creates.
    read_only prevents accidental writes from API code.
    """
    conn = get_connection()
    rel  = conn.execute(sql, params or [])
    cols = [desc[0] for desc in rel.description]
    return [dict(zip(cols, row)) for row in rel.fetchall()]`}</Code>
        <div style={{ marginTop:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase',
            letterSpacing:'0.12em', marginBottom:10 }}>Why parameterised queries ($1, $2, ...)?</div>
          <Code lang="python">{`# NEVER do this (SQL injection risk + f-string pollution):
sql = f"SELECT * FROM mart WHERE servicer_number = '{servicer_id}'"

# ALWAYS do this (injection-safe + Athena-compatible):
execute_query(
    "SELECT * FROM mart_kpi WHERE servicer_number = $1",
    [servicer_id]
)
# DuckDB uses $1, $2, ... — same syntax as Athena prepared statements.
# This means query strings are PORTABLE between both databases.`}</Code>
        </div>
        <Info color={T.athena} icon="🔮">
          <strong>Production swap preview:</strong> The Athena version of this file replaces
          <code style={{color:T.text}}> duckdb.connect()</code> with a
          <code style={{color:T.text}}> pyathena.connect()</code> call pointing at your S3 output bucket.
          The <code style={{color:T.text}}>execute_query()</code> function signature stays identical.
          Zero changes to any endpoint.
        </Info>
        <div style={{ background:T.hi, borderRadius:10, padding:16, marginTop:16,
          fontFamily:"'JetBrains Mono',monospace", fontSize:11, lineHeight:1.9, color:T.muted }}>
          <div style={{ color:T.accent, fontWeight:700, marginBottom:4 }}>How FastAPI uses it (every endpoint):</div>
          <div style={{color:T.text}}>execute_query(<span style={{color:'#86EFAC'}}>"SELECT ... FROM <span style={{color:T.dbt}}>mart_kpi_summary</span> WHERE ..."</span>, [params])</div>
          <div style={{color:T.dim}}>       ↓</div>
          <div>get_connection() → <span style={{color:T.duck}}>DuckDB file</span>  (local dev)</div>
          <div>get_connection() → <span style={{color:T.athena}}>Athena endpoint</span> (AWS prod)</div>
        </div>
      </div>
    )
  },

  // STEP 4
  { title:'startup.py — dbt at FastAPI boot', icon:'🚀', phase:'dbt',
    render: () => (
      <div>
        <p style={{ fontSize:14, color:T.muted, lineHeight:1.8, marginBottom:16 }}>
          FastAPI's <code style={{color:T.accent}}>lifespan</code> hook runs before the server
          accepts requests. We use it to run dbt, building the DuckDB mart tables fresh every time
          the API starts. This keeps local dev self-contained — one command starts everything.
        </p>
        <Code lang="python">{`# backend/startup.py

import subprocess, sys, os

DBT_PROJECT_DIR = os.path.join(os.path.dirname(__file__), "dbt_project")

def run_dbt():
    """Runs dbt seed + dbt run before FastAPI accepts any requests."""
    for cmd in [["dbt", "seed", "--profiles-dir", "."],
                ["dbt", "run",  "--profiles-dir", "."]]:
        result = subprocess.run(
            cmd,
            cwd=DBT_PROJECT_DIR,
            capture_output=True, text=True,
        )
        print(result.stdout)
        if result.returncode != 0:
            print(result.stderr, file=sys.stderr)
            raise RuntimeError(f"dbt command failed: {' '.join(cmd)}")
    print("[dbt] DuckDB marts are ready")`}</Code>
        <Code lang="python">{`# backend/main.py  — wired via lifespan hook

from contextlib import asynccontextmanager
from startup import run_dbt

@asynccontextmanager
async def lifespan(app: FastAPI):
    run_dbt()   # ← dbt builds DuckDB before first request
    yield       # ← server runs here

app = FastAPI(lifespan=lifespan)`}</Code>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:16 }}>
          <div style={{ padding:'12px 14px', background:T.hi, borderRadius:8,
            border:`1px solid ${T.green}33`, borderLeft:`3px solid ${T.green}` }}>
            <div style={{ color:T.green, fontWeight:700, fontSize:13, marginBottom:6 }}>Local dev (now)</div>
            <div style={{ fontSize:12.5, color:T.muted, lineHeight:1.6 }}>
              <code style={{color:T.text}}>uvicorn main:app</code> → dbt runs startup.py →
              DuckDB file built → API ready. Self-contained, no external deps.
            </div>
          </div>
          <div style={{ padding:'12px 14px', background:T.hi, borderRadius:8,
            border:`1px solid ${T.athena}33`, borderLeft:`3px solid ${T.athena}` }}>
            <div style={{ color:T.athena, fontWeight:700, fontSize:13, marginBottom:6 }}>AWS prod (future)</div>
            <div style={{ fontSize:12.5, color:T.muted, lineHeight:1.6 }}>
              startup.py is a no-op. dbt runs in CodeBuild on a schedule. ECS Fargate
              starts fresh, reads pre-built Athena tables via db/connection.py.
            </div>
          </div>
        </div>
        <Info color={T.warn} icon="⚠">
          <strong>Important:</strong> In production you never run dbt inside the API process.
          dbt is a transformation job (like a batch ETL). It runs on a schedule
          (CodeBuild daily, or EventBridge-triggered). The API is read-only.
          startup.py is a dev convenience that models this intent.
        </Info>
      </div>
    )
  },

  // STEP 5
  { title:'FastAPI endpoints: before vs after', icon:'⚡', phase:'dbt',
    render: () => (
      <div>
        <p style={{ fontSize:14, color:T.muted, lineHeight:1.8, marginBottom:16 }}>
          Compare the old Pandas endpoint with the new dbt-backed version.
          The new version is 8 lines instead of 40. All business logic moved into dbt SQL.
        </p>
        <Diff
          label="rejected_events endpoint migration"
          before={`@app.get("/api/rejected-events/by-servicer")
def get_rejected_events(servicer_id: str = None):
    filtered_df = RE_DF.copy()
    if servicer_id:
        filtered_df = filtered_df[
            filtered_df["servicer_id"] == servicer_id
        ]
    rows = []
    grouped = filtered_df.groupby("servicer_id")
    for svc_id, group in grouped:
        outstanding = int(
            (group["status"] == "Outstanding").sum()
        )
        pct = round(outstanding / len(RE_DF) * 100, 2)
        rows.append({
            "servicer_id": svc_id,
            "outstanding": outstanding,
            "pct": pct,
        })
    return rows`}
          after={`@app.get("/api/kpi-summary")
def kpi_summary(
    servicer_number: str = None,
    start_date:      str = None,
):
    where, params = _filter_clause(
        servicer_number, None, start_date, None
    )
    return execute_query(f"""
        SELECT servicer_number, loan_count,
               delinquency_rate_pct, metric_status
        FROM   mart_kpi_summary
        {where}
        ORDER BY business_date DESC
    """, params)`}
        />
        <Code lang="python">{`# _filter_clause() — reused by ALL 5 endpoints
def _filter_clause(svc_num, svc_name, start, end) -> tuple[str, list]:
    conditions, params = [], []
    if svc_num:
        params.append(svc_num)
        conditions.append(f"servicer_number = ${len(params)}")
    if start:
        params.append(start)
        conditions.append(f"business_date >= CAST(${len(params)} AS DATE)")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    return where, params

# Result: every endpoint is 8-12 lines instead of 40+.
# Each reads from a different pre-built mart table.`}</Code>
        <div style={{ marginTop:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:'uppercase',
            letterSpacing:'0.12em', marginBottom:8 }}>Endpoint → mart table mapping</div>
          {[
            ['GET /api/kpi-summary', 'mart_kpi_summary'],
            ['GET /api/charts/delinquency-trend', 'mart_delinquency_trend'],
            ['GET /api/charts/loan-by-region', 'mart_loan_by_region'],
            ['GET /api/charts/portfolio-balance', 'mart_portfolio_balance'],
            ['GET /api/charts/status-distribution', 'mart_status_distribution'],
          ].map(([ep, mart],i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12,
              padding:'8px 0', borderBottom:`1px solid ${T.border}22` }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11,
                color:T.accent, minWidth:240 }}>{ep}</span>
              <span style={{ color:T.dim }}>→</span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11,
                color:T.dbt }}>{mart}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },

  // STEP 6
  { title:'dbt schema.yml — the NLQ bonus', icon:'📋', phase:'dbt',
    render: () => (
      <div>
        <p style={{ fontSize:14, color:T.muted, lineHeight:1.8, marginBottom:16 }}>
          dbt's <code style={{color:T.accent}}>schema.yml</code> documents every model and column.
          This isn't just metadata — it's the exact format that Bedrock NLQ needs as context
          to generate accurate SQL. It also runs automated data quality tests on every dbt run.
        </p>
        <Code lang="yaml">{`# backend/dbt_project/models/marts/schema.yml

version: 2
models:
  - name: mart_kpi_summary
    description: >
      One row per (servicer_number, business_date). Powers the four KPI
      headline cards. Filter by business_date for a snapshot.
    columns:
      - name: servicer_number
        description: Business key for the servicer (e.g. SVC-001).
        tests: [not_null]              # ← dbt runs this automatically
      - name: delinquency_rate_pct
        description: Rate as a percentage — 3.2 means 3.2%.
        tests: [not_null]
      - name: metric_status
        description: "Risk classification: GREEN, YELLOW, or RED."
        tests:
          - accepted_values:
              values: ["GREEN", "YELLOW", "RED"]  # ← fails build if unexpected value`}</Code>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }}>
          <div style={{ padding:'12px 14px', background:T.hi, borderRadius:8,
            border:`1px solid ${T.green}33`, borderLeft:`3px solid ${T.green}` }}>
            <div style={{ color:T.green, fontWeight:700, fontSize:13, marginBottom:6 }}>Data quality benefit</div>
            <div style={{ fontSize:12.5, color:T.muted, lineHeight:1.6 }}>
              If a new CSV row has <code style={{color:T.text}}>metric_status = "AMBER"</code>,
              <code style={{color:T.text}}> dbt test</code> fails and the API doesn't start.
              Bad data never reaches Angular.
            </div>
          </div>
          <div style={{ padding:'12px 14px', background:T.hi, borderRadius:8,
            border:`1px solid ${T.athena}33`, borderLeft:`3px solid ${T.athena}` }}>
            <div style={{ color:T.athena, fontWeight:700, fontSize:13, marginBottom:6 }}>NLQ benefit</div>
            <div style={{ fontSize:12.5, color:T.muted, lineHeight:1.6 }}>
              Bedrock NLQ reads descriptions + column names from schema.yml.
              <em style={{color:T.text}}>"delinquency rate as a percentage"</em> lets the LLM
              generate <code style={{color:T.text}}>WHERE delinquency_rate_pct &gt; 5</code>
              instead of guessing column names.
            </div>
          </div>
        </div>
        <Code lang="python">{`# backend/dbt_schema.py — reads schema.yml for NLQ endpoint
import yaml
from pathlib import Path
from functools import lru_cache

@lru_cache(maxsize=1)
def load_dbt_schema(filter_models: tuple = ()) -> dict:
    path = Path(__file__).parent / "dbt_project/models/marts/schema.yml"
    data = yaml.safe_load(path.read_text())
    return {
        m["name"]: {
            "description": m.get("description", ""),
            "columns": { c["name"]: c.get("description","")
                         for c in m.get("columns", []) }
        }
        for m in data.get("models", [])
        if not filter_models or m["name"] in filter_models
    }
# This dict goes straight into the Bedrock prompt as JSON context.`}</Code>
      </div>
    )
  },

  // STEP 7
  { title:'The production swap: 3 file changes', icon:'☁', phase:'prod',
    render: () => (
      <div>
        <p style={{ fontSize:14, color:T.muted, lineHeight:1.8, marginBottom:16 }}>
          This is the payoff of the whole architecture. Moving from DuckDB to AWS Athena
          requires <strong style={{color:T.text}}>exactly 3 file changes</strong>. Every mart SQL,
          every FastAPI endpoint, every Angular component stays identical.
        </p>

        <Diff
          label="Change 1 of 3 — requirements.txt"
          beforeLang="text" afterLang="text"
          before={`fastapi==0.115.0
uvicorn[standard]==0.32.0
pandas==2.2.3
duckdb==1.2.2
dbt-core==1.9.4
dbt-duckdb==1.9.2`}
          after={`fastapi==0.115.0
uvicorn[standard]==0.32.0
dbt-core==1.9.4
dbt-athena-community==1.9.x  # ← swap adapter
pyathena==3.x                 # ← Athena connector
boto3==1.x                    # ← AWS SDK
# pandas removed — not needed anymore
# duckdb removed`}
        />

        <Diff
          label="Change 2 of 3 — dbt_project/profiles.yml"
          beforeLang="yaml" afterLang="yaml"
          before={`fnma_local:
  target: duckdb
  outputs:
    duckdb:
      type: duckdb
      path: "../db/fnma.duckdb"
      threads: 4`}
          after={`fnma_prod:
  target: athena
  outputs:
    athena:
      type: athena
      region_name: us-east-1
      s3_staging_dir: s3://fnma-dbt-results/
      database: fnma_reporting   # Glue database
      schema: reporting          # same schema name
      threads: 8`}
        />

        <Diff
          label="Change 3 of 3 — db/connection.py (the swap point)"
          before={`import duckdb, os

_DB_PATH = os.path.join(os.path.dirname(__file__), "fnma.duckdb")
_conn = None

def get_connection():
    global _conn
    if _conn is None:
        _conn = duckdb.connect(_DB_PATH, read_only=True)
    return _conn

def execute_query(sql, params=None):
    conn = get_connection()
    rel  = conn.execute(sql, params or [])
    cols = [d[0] for d in rel.description]
    return [dict(zip(cols, r)) for r in rel.fetchall()]`}
          after={`import pyathena, boto3, os

_conn = None

def get_connection():
    global _conn
    if _conn is None:
        _conn = pyathena.connect(
            region_name="us-east-1",
            s3_staging_dir=os.environ["ATHENA_S3_STAGING"],
            schema_name="reporting",
        )
    return _conn

def execute_query(sql, params=None):
    conn   = get_connection()
    cursor = conn.cursor()
    cursor.execute(sql, params or [])
    cols = [d[0] for d in cursor.description]
    return [dict(zip(cols, r)) for r in cursor.fetchall()]`}
        />

        <Info color={T.green} icon="✅">
          <strong>Everything else is unchanged:</strong> all 5 dbt mart SQL files,
          all 5 FastAPI endpoints, <code style={{color:T.text}}>_filter_clause()</code>,
          the entire Angular app, Plotly charts, NLQ panel — none of it changes.
          The abstraction in <code style={{color:T.text}}>execute_query()</code> isolated
          the database from the application layer completely.
        </Info>
      </div>
    )
  },

  // STEP 8
  { title:'Full AWS production architecture', icon:'🏗', phase:'prod',
    render: () => (
      <div>
        <p style={{ fontSize:14, color:T.muted, lineHeight:1.8, marginBottom:16 }}>
          How every piece maps from local DuckDB+dbt to the SFST AWS account.
          The data pipeline and API run independently — dbt transforms in CodeBuild,
          FastAPI reads in ECS Fargate.
        </p>

        <div style={{ background:T.hi, borderRadius:10, padding:20, marginBottom:16,
          fontFamily:"'JetBrains Mono',monospace", fontSize:11.5, lineHeight:2.3 }}>
          <div style={{ color:T.muted, marginBottom:8 }}>── Data pipeline (runs on schedule) ───────────────</div>
          <div style={{ paddingLeft:8, color:T.muted }}>
            S3 Parquet / Iceberg<br/>
            <span style={{paddingLeft:8, color:T.dim}}>↓ (Glue Catalog knows table schemas)</span><br/>
            dbt-athena runs in <span style={{color:T.athena}}>CodeBuild</span> (CodePipeline trigger or EventBridge)<br/>
            <span style={{paddingLeft:8, color:T.dim}}>↓ (dbt seed skipped — data already in S3)</span><br/>
            dbt run → Athena executes <span style={{color:T.dbt}}>mart_*.sql</span> → writes results to S3<br/>
            dbt test → fails pipeline if data quality violated → SNS alert<br/>
          </div>
          <br/>
          <div style={{ color:T.muted, marginBottom:8 }}>── API (runs continuously on ECS Fargate) ──────────</div>
          <div style={{ paddingLeft:8, color:T.muted }}>
            FastAPI starts on <span style={{color:T.green}}>ECS Fargate</span><br/>
            <span style={{paddingLeft:8, color:T.dim}}>↓ startup.py is a no-op in prod</span><br/>
            Request arrives → <code style={{color:T.accent}}>execute_query()</code> → <span style={{color:T.athena}}>Athena</span><br/>
            <span style={{paddingLeft:8, color:T.dim}}>↓ Athena reads pre-built mart tables from S3</span><br/>
            JSON → Angular MFE → Plotly charts<br/>
          </div>
        </div>

        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:T.hi }}>
                {['Component','Local (now)','AWS Production'].map(h => (
                  <th key={h} style={{ padding:'10px 12px', textAlign:'left', color:T.muted,
                    fontWeight:600, borderBottom:`1px solid ${T.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Raw data source','seeds/servicer_metrics.csv','S3 Parquet / Iceberg tables (SDL/LSDL)'],
                ['Data catalog','DuckDB internal catalog','AWS Glue Data Catalog'],
                ['SQL engine','DuckDB 1.2 (file on disk)','Amazon Athena (serverless)'],
                ['dbt adapter','dbt-duckdb','dbt-athena-community'],
                ['dbt runs when','FastAPI startup (startup.py)','CodeBuild (CodePipeline schedule)'],
                ['Connection singleton','duckdb.connect(path)','pyathena.connect(region, s3)'],
                ['Results stored in','fnma.duckdb file','S3 query results bucket'],
                ['FastAPI hosting','uvicorn localhost:8000','ECS Fargate (SFST account)'],
                ['Secrets','env vars / local','AWS Secrets Manager'],
                ['Data quality alerts','terminal stdout','SNS → email/Slack'],
              ].map(([comp, local, prod], i) => (
                <tr key={i} style={{ borderBottom:`1px solid ${T.border}22`,
                  background: i % 2 === 0 ? T.hi+'44' : 'transparent' }}>
                  <td style={{ padding:'9px 12px', color:T.text, fontWeight:600, fontSize:11.5 }}>{comp}</td>
                  <td style={{ padding:'9px 12px', color:T.duck, fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{local}</td>
                  <td style={{ padding:'9px 12px', color:T.athena, fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{prod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Info color={T.accent} icon="🎯">
          <strong>MSR impact:</strong> dbt is a transformation tool, not a running service.
          It runs inside CodeBuild (which already exists). No new MSR registration is needed
          for dbt itself. Only the FastAPI backend service has an MSR, and its endpoints
          don't change — Athena is just a different db/connection.py.
        </Info>
      </div>
    )
  },
];

// ─── AI ADVISOR ───────────────────────────────────────────────────────────────
const SYSTEM = `You are a senior data engineer explaining the transition from CSV+Pandas to DuckDB+dbt, and eventually to AWS Athena+S3 Iceberg tables, for the Fannie Mae Loan Servicing Reporting Dashboard (MSR17051-HT7).

Project context:
- Local PoC had CSV files + Pandas aggregations in FastAPI (rejected_events.py)
- New architecture: dbt seeds → staging models → mart models → DuckDB file → FastAPI reads via execute_query()
- Future prod: same dbt SQL models but with dbt-athena adapter, S3 Parquet/Iceberg data, pyathena connector
- The single abstraction point is db/connection.py — execute_query() is the only function FastAPI calls
- Three files change for prod: requirements.txt, profiles.yml, db/connection.py
- Everything else (dbt models, FastAPI endpoints, Angular) stays identical
- Infrastructure: ECS Fargate (API), CodeBuild (dbt runs), S3+Glue (data), Athena (SQL engine), Secrets Manager (creds)
- dbt runs inside startup.py locally (dev convenience); in prod, dbt runs in CodeBuild on schedule (startup.py is no-op)

Answer technically and specifically. Use code examples when helpful. Flag Fannie Mae constraints (Nexus pip, Artifactory, MSR).`;

const AskAdvisor = () => {
  const [msgs, setMsgs] = useState([{role:'assistant',content:'Ask me anything about the CSV→DuckDB→Athena migration — why each change was made, how the prod swap works, or anything else about the architecture.'}]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({behavior:'smooth'}); }, [msgs]);

  const quick = ['Why not keep Pandas?','How does execute_query() hide the database?','What does startup.py do in prod?','How does dbt-athena differ from dbt-duckdb?','What is Glue Catalog?','Why Iceberg tables?'];

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || busy) return;
    setInput('');
    const next = [...msgs, {role:'user',content:q}];
    setMsgs(next);
    setBusy(true);
    try {
      const apiMsgs = next.filter((m,i) => !(i===0 && m.role==='assistant')).map(m => ({role:m.role,content:m.content}));
      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,system:SYSTEM,messages:apiMsgs})
      });
      const data = await res.json();
      setMsgs(m => [...m, {role:'assistant',content:data.content?.[0]?.text||'No response.'}]);
    } catch { setMsgs(m => [...m, {role:'assistant',content:'Network error.'}]); }
    setBusy(false);
  };

  return (
    <div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:14 }}>
        {quick.map((q,i) => (
          <button key={i} onClick={()=>send(q)} disabled={busy} style={{
            padding:'5px 11px', borderRadius:20, fontSize:11.5, cursor:'pointer',
            border:`1px solid ${T.accent}44`, background:T.hi, color:T.accent, fontFamily:'inherit'
          }}>{q}</button>
        ))}
      </div>
      <div style={{ height:300, overflowY:'auto', background:T.hi, borderRadius:10,
        border:`1px solid ${T.border}`, padding:14, display:'flex', flexDirection:'column', gap:12 }}>
        {msgs.map((m,i) => (
          <div key={i} style={{ alignSelf:m.role==='user'?'flex-end':'flex-start', maxWidth:'88%',
            background:m.role==='user'?`${T.accent}1A`:T.surface,
            border:`1px solid ${m.role==='user'?T.accent+'44':T.border}`,
            borderRadius:10, padding:'10px 14px' }}>
            <div style={{ fontSize:11, color:T.muted, marginBottom:5 }}>{m.role==='user'?'You':'🤖 Migration Advisor'}</div>
            <div style={{ fontSize:13, color:T.text, lineHeight:1.75, whiteSpace:'pre-wrap' }}>{m.content}</div>
          </div>
        ))}
        {busy && <div style={{ color:T.muted, fontSize:13 }}>Thinking…</div>}
        <div ref={endRef} />
      </div>
      <div style={{ display:'flex', gap:8, marginTop:12 }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}
          placeholder="Ask about the migration…" disabled={busy}
          style={{ flex:1, padding:'9px 14px', background:T.hi, border:`1px solid ${T.border}`,
            borderRadius:8, color:T.text, fontSize:13, fontFamily:'inherit', outline:'none' }}/>
        <button onClick={()=>send()} disabled={busy||!input.trim()}
          style={{ padding:'9px 20px', borderRadius:8, border:'none', cursor:'pointer',
            background:(busy||!input.trim())?T.border:T.accent,
            color:(busy||!input.trim())?T.muted:T.bg, fontWeight:700, fontSize:13, fontFamily:'inherit' }}>Send</button>
      </div>
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [active, setActive] = useState(0);
  const step = steps[active];

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.text, fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        h2 { font-size:20px; font-weight:700; margin-bottom:12px; color:#E2EAF8; }
        p { font-size:14px; line-height:1.8; color:#5B7A9C; }
        strong { color:#E2EAF8; }
        code { font-family:'JetBrains Mono',monospace; font-size:12px; background:#0F1E35; padding:2px 6px; border-radius:4px; color:#B8D0F0; }
        em { color:#8BA3BF; }
        ::-webkit-scrollbar { width:5px; } ::-webkit-scrollbar-track { background:transparent; } ::-webkit-scrollbar-thumb { background:#1E3A5F; border-radius:3px; }
        input:focus { border-color:#00D4FF !important; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:none} }
      `}</style>

      {/* Header */}
      <div style={{ padding:'12px 24px', borderBottom:`1px solid ${T.border}`,
        background:T.surface, display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:36, height:36, borderRadius:8, background:`${T.dbt}15`,
          border:`1px solid ${T.dbt}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🔄</div>
        <div>
          <div style={{ fontWeight:700, fontSize:15, fontFamily:"'JetBrains Mono',monospace", color:T.text }}>
            CSV → DuckDB+dbt → AWS Athena — Migration Guide
          </div>
          <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>Fannie Mae Reporting Dashboard · MSR17051-HT7</div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:7 }}>
          {[{l:'DuckDB',c:T.duck},{l:'dbt-duckdb',c:T.dbt},{l:'dbt-athena',c:T.athena}].map(b=>(
            <span key={b.l} style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700,
              background:`${b.c}1A`, border:`1px solid ${b.c}44`, color:b.c }}>{b.l}</span>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', height:'calc(100vh - 62px)' }}>
        {/* Sidebar */}
        <div style={{ width:230, flexShrink:0, background:T.surface, borderRight:`1px solid ${T.border}`,
          padding:'16px 10px', display:'flex', flexDirection:'column', gap:3, overflowY:'auto' }}>
          <div style={{ fontSize:10, color:T.muted, fontWeight:600, letterSpacing:'0.12em',
            textTransform:'uppercase', padding:'0 10px 12px' }}>8 Steps</div>
          {steps.map((s,i) => {
            const on = active === i;
            const phaseColor = s.phase==='poc' ? T.red : s.phase==='dbt' ? T.dbt : T.athena;
            return (
              <button key={i} onClick={()=>setActive(i)} style={{
                display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
                borderRadius:7, border:'none', cursor:'pointer',
                background: on ? `${phaseColor}14` : 'transparent',
                borderLeft:`2px solid ${on ? phaseColor : 'transparent'}`,
                color: on ? phaseColor : T.muted,
                fontSize:12.5, fontWeight: on ? 600 : 400,
                textAlign:'left', fontFamily:'inherit', transition:'all 0.15s',
              }}>
                <span style={{ fontSize:14, flexShrink:0 }}>{s.icon}</span>
                <span style={{ lineHeight:1.3 }}>{s.title}</span>
              </button>
            );
          })}
          <div style={{ marginTop:'auto', padding:'14px 10px 0', borderTop:`1px solid ${T.border}` }}>
            {[{l:'PoC (steps 0-1)',c:T.red},{l:'DuckDB+dbt (2-6)',c:T.dbt},{l:'AWS Prod (7-8)',c:T.athena}].map(r=>(
              <div key={r.l} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:6 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:r.c, flexShrink:0 }}/>
                <span style={{ fontSize:11, color:T.muted }}>{r.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'24px 32px' }}>
          <Pipeline activeStep={active} />

          <div style={{ animation:'fadeIn 0.25s ease' }}>
            <h2>{step.title}</h2>
            {step.render()}
          </div>

          {/* AI Chat */}
          <div style={{ marginTop:40, padding:'20px 0', borderTop:`1px solid ${T.border}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <span style={{ fontSize:20 }}>🤖</span>
              <div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:14, color:T.text }}>Migration Advisor</div>
                <div style={{ fontSize:11, color:T.muted }}>Pre-loaded with your project context</div>
              </div>
            </div>
            <AskAdvisor />
          </div>

          {/* Next / Prev */}
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:24, paddingBottom:32 }}>
            <button onClick={()=>setActive(Math.max(0,active-1))} disabled={active===0}
              style={{ padding:'9px 20px', borderRadius:8, border:`1px solid ${T.border}`,
                background:'transparent', color: active===0 ? T.dim : T.muted,
                cursor: active===0 ? 'not-allowed' : 'pointer', fontFamily:'inherit', fontSize:13 }}>
              ← Previous
            </button>
            <span style={{ fontSize:12, color:T.muted, alignSelf:'center' }}>
              Step {active+1} of {steps.length}
            </span>
            <button onClick={()=>setActive(Math.min(steps.length-1,active+1))} disabled={active===steps.length-1}
              style={{ padding:'9px 20px', borderRadius:8, border:'none',
                background: active===steps.length-1 ? T.border : T.accent,
                color: active===steps.length-1 ? T.muted : T.bg,
                cursor: active===steps.length-1 ? 'not-allowed' : 'pointer',
                fontWeight:700, fontFamily:'inherit', fontSize:13 }}>
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
