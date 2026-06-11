"""
Reporting API — backend/main.py
================================
Run:  uvicorn main:app --reload --port 8000
Docs: http://localhost:8000/docs  (auto-generated, interactive)

Four chart endpoints, each returns Plotly-compatible JSON.
Angular calls these directly with query params as filters.
"""

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from typing import Optional
import math
import os
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# ── App setup ─────────────────────────────────────────────────────────────
app = FastAPI(title="Servicer Reporting API", version="1.0.0")

# CORS: allows the Angular dev server on :4200 to call this API on :8000.
# Without this the browser blocks every request.
cors_origins = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:4200").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins if origin.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Load CSV once at startup ───────────────────────────────────────────────
# The DataFrame stays in memory. Restart the server if you edit the CSV.
print("[startup] loading servicer_metrics.csv ...")
DF = pd.read_csv("data/servicer_metrics.csv")
DF["business_date"] = pd.to_datetime(DF["business_date"]).dt.date
print(f"[startup] {len(DF)} rows, {DF['servicer_number'].nunique()} servicers ready")

# Chart colour palette — one colour per servicer
COLOURS = ["#38bdf8", "#818cf8", "#34d399", "#fb923c",
           "#f472b6", "#a78bfa", "#facc15", "#60a5fa"]

NLQ_CONTEXTS = {
    "delinquency-trend": {
        "chart_id": "delinquency-trend",
        "title": "Delinquency Rate Trend (%)",
        "system_prompt_context": (
            "This chart tracks delinquency rate percentage over time per servicer. "
            "Use business_date for timeline comparisons and delinquency_rate for trend analysis."
        ),
        "api_endpoint": "/api/charts/delinquency-trend",
        "answerable_questions": [
            "Which servicer has the highest delinquency trend?",
            "How did delinquency change over the selected date range?",
        ],
    },
    "loan-by-region": {
        "chart_id": "loan-by-region",
        "title": "Loan Count by Region & Servicer",
        "system_prompt_context": (
            "This grouped bar chart compares loan counts by region and servicer. "
            "Use it for concentration and regional distribution insights."
        ),
        "api_endpoint": "/api/charts/loan-by-region",
        "answerable_questions": [
            "Which region has the highest loan concentration?",
            "Which servicer dominates in a specific region?",
        ],
    },
    "portfolio-balance": {
        "chart_id": "portfolio-balance",
        "title": "Portfolio Balance - USD Millions",
        "system_prompt_context": (
            "This horizontal bar chart shows latest snapshot portfolio balance by servicer in USD millions. "
            "Use it for ranking servicers by exposure."
        ),
        "api_endpoint": "/api/charts/portfolio-balance",
        "answerable_questions": [
            "Which servicer has the largest portfolio balance?",
            "How concentrated is total balance among top servicers?",
        ],
    },
    "status-distribution": {
        "chart_id": "status-distribution",
        "title": "Servicer Status Distribution",
        "system_prompt_context": (
            "This donut chart shows servicer counts by metric status (GREEN/YELLOW/RED) "
            "for the latest available business date."
        ),
        "api_endpoint": "/api/charts/status-distribution",
        "answerable_questions": [
            "How many servicers are RED right now?",
            "Is the portfolio mostly GREEN or at risk?",
        ],
    },
    "kpi-total-loans": {
        "chart_id": "kpi-total-loans",
        "title": "KPI Total Loans",
        "system_prompt_context": "This KPI card shows total loans from the latest snapshot.",
        "api_endpoint": "/api/kpi-summary",
        "answerable_questions": ["What is the current total loan count?"],
    },
    "kpi-avg-delinquency": {
        "chart_id": "kpi-avg-delinquency",
        "title": "KPI Avg Delinquency",
        "system_prompt_context": "This KPI card shows average delinquency rate percentage.",
        "api_endpoint": "/api/kpi-summary",
        "answerable_questions": ["What is the average delinquency for selected filters?"],
    },
    "kpi-portfolio-balance": {
        "chart_id": "kpi-portfolio-balance",
        "title": "KPI Portfolio Balance",
        "system_prompt_context": "This KPI card shows total portfolio balance in USD millions.",
        "api_endpoint": "/api/kpi-summary",
        "answerable_questions": ["What is the current portfolio balance?"],
    },
    "kpi-status": {
        "chart_id": "kpi-status",
        "title": "KPI Status",
        "system_prompt_context": "This KPI card shows counts of GREEN/YELLOW/RED servicers.",
        "api_endpoint": "/api/kpi-summary",
        "answerable_questions": ["How many servicers are in each status bucket?"],
    },
}

# ── Shared filter helper ───────────────────────────────────────────────────

def apply_filters(
    df: pd.DataFrame,
    servicer_number: Optional[str],
    servicer_name: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
) -> pd.DataFrame:
    """Apply all four optional filter parameters to a DataFrame copy."""
    if servicer_number:
        df = df[df["servicer_number"] == servicer_number]
    if servicer_name:
        df = df[df["servicer_name"].str.lower().str.contains(
            servicer_name.strip().lower(), na=False)]
    if start_date:
        df = df[df["business_date"] >= pd.to_datetime(start_date).date()]
    if end_date:
        df = df[df["business_date"] <= pd.to_datetime(end_date).date()]
    return df


def build_data_summary(df: pd.DataFrame) -> dict:
    """Compact summary of filtered data passed to NLQ model."""
    if df.empty:
        return {
            "rows": 0,
            "servicer_count": 0,
            "date_range": None,
            "total_loans": 0,
            "avg_delinquency_rate_pct": 0,
            "total_balance_usd_m": 0,
            "status_counts": {"GREEN": 0, "YELLOW": 0, "RED": 0},
            "top_servicers_by_balance": [],
        }

    latest = df["business_date"].max()
    snap = df[df["business_date"] == latest]
    status_counts = snap.groupby("metric_status").size().to_dict()
    for status in ["GREEN", "YELLOW", "RED"]:
        status_counts.setdefault(status, 0)

    top = (
        snap.groupby(["servicer_number", "servicer_name"]) ["total_balance_usd"]
        .sum()
        .reset_index()
        .sort_values("total_balance_usd", ascending=False)
        .head(5)
    )

    return {
        "rows": int(len(df)),
        "servicer_count": int(df["servicer_number"].nunique()),
        "date_range": {
            "start": str(df["business_date"].min()),
            "end": str(df["business_date"].max()),
        },
        "total_loans": int(snap["loan_count"].sum()),
        "avg_delinquency_rate_pct": round(float(snap["delinquency_rate"].mean()) * 100, 2),
        "total_balance_usd_m": round(float(snap["total_balance_usd"].sum()) / 1e6, 1),
        "status_counts": {k: int(v) for k, v in status_counts.items()},
        "top_servicers_by_balance": [
            {
                "servicer_number": row["servicer_number"],
                "servicer_name": row["servicer_name"],
                "balance_usd_m": round(float(row["total_balance_usd"]) / 1e6, 1),
            }
            for _, row in top.iterrows()
        ],
    }


def call_openai_nlq(prompt: str, model: str = "gpt-4.1-mini") -> str:
    """Call OpenAI Responses API using stdlib HTTP for lightweight setup."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="OPENAI_API_KEY not configured. Set it in your environment or docker-compose.",
        )

    payload = {
        "model": model,
        "input": prompt,
        "temperature": 0.2,
    }
    request = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=60) as response:
            body = json.loads(response.read().decode("utf-8"))
            text = body.get("output_text", "").strip()
            if text:
                return text

            # fallback for unexpected response shape
            outputs = body.get("output", [])
            fragments = []
            for out in outputs:
                for content in out.get("content", []):
                    if content.get("type") == "output_text":
                        fragments.append(content.get("text", ""))
            return "\n".join(fragments).strip() or "No response generated."
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {details}") from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail="Unable to reach OpenAI API.") from exc

# ── Common query param shorthand ──────────────────────────────────────────
# Used in every endpoint signature — keeps them DRY.
SVC_NUM  = Query(None, description="Exact servicer number, e.g. SVC-001")
SVC_NAME = Query(None, description="Servicer name substring, case-insensitive")
START    = Query(None, description="Start date YYYY-MM-DD (inclusive)")
END      = Query(None, description="End date YYYY-MM-DD (inclusive)")


# ════════════════════════════════════════════════════════════════════════════
# UTILITY ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

@app.get("/health", tags=["utility"])
def health():
    """Quick liveness check. Open this in the browser to confirm the API is up."""
    return {"status": "ok", "rows": int(len(DF)), "version": "1.0.0"}


@app.get("/api/filters/servicers", tags=["filters"])
def list_servicers():
    """
    Returns all unique (servicer_number, servicer_name) pairs.
    Angular calls this once on load to populate the filter dropdown.
    """
    servicers = (
        DF[["servicer_number", "servicer_name"]]
        .drop_duplicates()
        .sort_values("servicer_number")
        .to_dict(orient="records")
    )
    return {"items": servicers, "count": len(servicers)}


@app.get("/api/nlq/context", tags=["nlq"])
def nlq_context_all():
    """Return all chart/KPI NLQ contexts for frontend quick lookup."""
    return {"items": list(NLQ_CONTEXTS.values()), "count": len(NLQ_CONTEXTS)}


@app.get("/api/nlq/context/{chart_id}", tags=["nlq"])
def nlq_context_by_id(chart_id: str):
    context = NLQ_CONTEXTS.get(chart_id)
    if not context:
        raise HTTPException(status_code=404, detail=f"Unknown chart_id: {chart_id}")
    return context


@app.post("/api/nlq/query", tags=["nlq"])
def nlq_query(payload: dict):
    """
    Quick NLQ endpoint for prototype chat panel.
    Expects: chart_id, user_query, active_filters (optional), session (optional).
    """
    chart_id = payload.get("chart_id")
    user_query = (payload.get("user_query") or "").strip()
    active_filters = payload.get("active_filters") or {}
    session = payload.get("session") or {}

    if not chart_id:
        raise HTTPException(status_code=400, detail="chart_id is required")
    if not user_query:
        raise HTTPException(status_code=400, detail="user_query is required")

    context = NLQ_CONTEXTS.get(chart_id)
    if not context:
        raise HTTPException(status_code=404, detail=f"Unknown chart_id: {chart_id}")

    filtered = apply_filters(
        DF,
        active_filters.get("servicer_number"),
        active_filters.get("servicer_name"),
        active_filters.get("start_date"),
        active_filters.get("end_date"),
    )
    summary = build_data_summary(filtered)

    prompt = (
        "You are a reporting analyst assistant for a loan servicing dashboard. "
        "Keep responses concise, factual, and based only on provided context. "
        "If data is insufficient, state that clearly.\n\n"
        f"Chart context: {json.dumps(context)}\n"
        f"Session context: {json.dumps(session)}\n"
        f"Active filters: {json.dumps(active_filters)}\n"
        f"Filtered dataset summary: {json.dumps(summary)}\n\n"
        f"User question: {user_query}\n\n"
        "Return 2 sections:\n"
        "1) Direct Answer\n"
        "2) Evidence (bullets using values from summary)."
    )

    answer = call_openai_nlq(prompt)
    return {
        "chart_id": chart_id,
        "answer": answer,
        "context": context,
        "applied_filters": active_filters,
        "summary": summary,
    }


# ════════════════════════════════════════════════════════════════════════════
# KPI SUMMARY  — powers the four metric cards at the top
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/kpi-summary", tags=["charts"])
def kpi_summary(
    servicer_number: Optional[str] = SVC_NUM,
    servicer_name:   Optional[str] = SVC_NAME,
    start_date:      Optional[str] = START,
    end_date:        Optional[str] = END,
):
    """
    Returns four headline numbers for the KPI card row:
      total_loans, avg_delinquency_rate, total_balance_usd, servicer_count
    Uses the latest business_date snapshot.
    """
    df = apply_filters(DF, servicer_number, servicer_name, start_date, end_date)
    if df.empty:
        return {"total_loans": 0, "avg_delinquency_rate": 0,
                "total_balance_usd": 0, "servicer_count": 0,
                "status_counts": {"GREEN": 0, "YELLOW": 0, "RED": 0}}

    latest = df["business_date"].max()
    snap   = df[df["business_date"] == latest]

    status_counts = snap.groupby("metric_status").size().to_dict()
    for s in ["GREEN", "YELLOW", "RED"]:
        status_counts.setdefault(s, 0)

    return {
        "total_loans":          int(snap["loan_count"].sum()),
        "avg_delinquency_rate": round(float(snap["delinquency_rate"].mean()) * 100, 2),
        "total_balance_usd":    round(float(snap["total_balance_usd"].sum()) / 1e6, 1),
        "servicer_count":       int(snap["servicer_number"].nunique()),
        "status_counts":        {k: int(v) for k, v in status_counts.items()},
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
    """
    Line chart: delinquency rate (%) over time, one line per servicer.
    X axis = business_date, Y axis = delinquency_rate * 100.
    """
    df = apply_filters(DF, servicer_number, servicer_name, start_date, end_date)
    df = df.sort_values("business_date")

    traces = []
    for i, (svc_num, grp) in enumerate(df.groupby("servicer_number")):
        traces.append({
            "type":   "scatter",
            "mode":   "lines+markers",
            "name":   f"{svc_num} — {grp['servicer_name'].iloc[0]}",
            "x":      [str(d) for d in grp["business_date"]],
            "y":      [round(v * 100, 3) for v in grp["delinquency_rate"]],
            "line":   {"color": COLOURS[i % len(COLOURS)], "width": 2.5},
            "marker": {"size": 6},
        })

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
    """
    Grouped bar chart: total loan count per region, grouped by servicer.
    X axis = region, Y axis = sum(loan_count).
    """
    df = apply_filters(DF, servicer_number, servicer_name, start_date, end_date)
    grp = (
        df.groupby(["region", "servicer_number", "servicer_name"])
        .agg(loan_count=("loan_count", "sum"))
        .reset_index()
        .sort_values("region")
    )

    traces = []
    for i, (svc_num, g) in enumerate(grp.groupby("servicer_number")):
        traces.append({
            "type":   "bar",
            "name":   f"{svc_num} — {g['servicer_name'].iloc[0]}",
            "x":      g["region"].tolist(),
            "y":      g["loan_count"].tolist(),
            "marker": {"color": COLOURS[i % len(COLOURS)]},
        })

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
    """
    Horizontal bar chart: total portfolio balance (USD millions) per servicer
    as of the most recent business date.
    """
    df = apply_filters(DF, servicer_number, servicer_name, start_date, end_date)
    latest = df["business_date"].max()
    snap   = df[df["business_date"] == latest]
    agg    = (
        snap.groupby(["servicer_number", "servicer_name"])
        .agg(balance=("total_balance_usd", "sum"))
        .reset_index()
        .sort_values("balance")          # ascending so longest bar is at top
    )

    labels = [f"{r['servicer_number']} — {r['servicer_name']}" for _, r in agg.iterrows()]
    values = [round(v / 1e6, 1) for v in agg["balance"]]

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
    """
    Donut chart: count of servicers by metric status (GREEN / YELLOW / RED)
    on the most recent business date.
    """
    df = apply_filters(DF, servicer_number, servicer_name, start_date, end_date)
    latest = df["business_date"].max()
    snap   = df[df["business_date"] == latest]
    counts = snap.groupby("metric_status").size().reset_index(name="count")

    color_map = {"GREEN": "#10b981", "YELLOW": "#f59e0b", "RED": "#ef4444"}
    colours   = [color_map.get(s, "#94a3b8") for s in counts["metric_status"]]

    return {
        "chartType": "pie",
        "title":     f"Servicer Status Distribution (as of {latest})",
        "traces": [{
            "type":     "pie",
            "hole":     0.55,
            "labels":   counts["metric_status"].tolist(),
            "values":   counts["count"].tolist(),
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
