# NLQ Chatbot Integration — Implementation README

> **Project:** Fannie Mae Loan Servicing Platform — Reporting Dashboard MFE (MSR17051-HT7)
> **Branch:** `develop-rptmfe-docker`
> **Scope:** Wiring the NLQ chatbot panel into the running Angular dashboard so clicking
> the 💬 icon on any chart opens a context-aware chat assistant.

---

## What this document covers

This README is the step-by-step implementation guide that accompanies
`NLQ_Chatbot_Integration_Guide.html` (the rich visual reference). Use both together:

- **HTML file** → architecture diagrams, dashboard mockups, chat panel mockup, chart metadata tables, formatted Copilot prompts
- **This README** → exact file paths, do/don't rules, wiring checklist, and how to verify each step works

---

## Prerequisites checklist

Before running any Copilot prompt, confirm:

- [ ] Reporting Engine Docker is running: `http://localhost:8000/docs` loads Swagger UI
- [ ] `backend/data/rejected_events.csv` exists and is not empty
- [ ] `backend/data/servicer_metrics.csv` exists (note: `backend/data copy/servicer_metrics.csv` has been deleted)
- [ ] Angular app runs on `http://localhost:4200`
- [ ] `docs/nlq/` folder exists (create with `mkdir -p docs/nlq`)
- [ ] `angular-app/src/assets/nlq/` folder exists (create with `mkdir -p angular-app/src/assets/nlq`)
- [ ] VS Code has `backend/rejected_events.py`, both CSVs, and `backend/main.py` open as tabs

---

## File map — what gets created and where

```
repo root (DEV-FNMA-REPORTING-POC-LOCAL-MAIN)
│
├── docs/
│   └── nlq/
│       ├── metadata.json                  ← data vocabulary (from prior guide Prompt 5)
│       ├── chart_nlq_context.json         ← per-chart NLQ context  ← NEW (Prompt D)
│       ├── openapi.json                   ← static API spec snapshot
│       └── README.md                      ← this file (hand-off for NLQ developer)
│
├── backend/
│   ├── rejected_events.py                 ← existing routes (modified by Prompt E)
│   ├── nlq_context.py                     ← NEW (Prompt E) — /api/nlq/context endpoints
│   └── main.py                            ← include_router call added by Prompt E
│
└── angular-app/
    └── src/
        ├── assets/
        │   └── nlq/
        │       └── chart_nlq_context.json ← copy of docs/nlq/chart_nlq_context.json (Prompt D)
        └── app/
            ├── services/
            │   └── nlq.service.ts         ← NEW (Prompt A)
            └── components/
                ├── reporting-dashboard/   ← MODIFIED (Prompt B) — adds NLQ buttons
                └── nlq-chat-panel/        ← NEW (Prompt C) — slide-in chat component
```

---

## Step-by-step implementation

### Step 1 — Run Copilot Prompt D first (generate the JSON files)

The JSON context files must exist before the Angular code can reference them.

In VS Code Copilot Chat (`Ctrl+Shift+I`), run **Prompt D** from the HTML guide.

Verify output:

```bash
# Check the file exists and has all 7 chart_id entries
cat docs/nlq/chart_nlq_context.json | python -c "
import json,sys
data = json.load(sys.stdin)
ids = [c['chart_id'] for c in data['chart_contexts']]
print('Found chart_ids:', ids)
assert len(ids) == 7, 'Expected 7 entries'
print('OK')
"

# Copy to Angular assets
cp docs/nlq/chart_nlq_context.json angular-app/src/assets/nlq/chart_nlq_context.json
```

Expected output:
```
Found chart_ids: ['delinquency_rate_trend', 'loan_count_region_servicer', 'portfolio_balance',
                  'servicer_status_dist', 'kpi_total_loans', 'kpi_avg_delinquency', 'kpi_portfolio_balance']
OK
```

---

### Step 2 — Run Copilot Prompt E (add FastAPI endpoints)

Run **Prompt E** to add `backend/nlq_context.py` and update `main.py`.

Verify by restarting Docker and hitting:

```bash
curl http://localhost:8000/api/nlq/context | python -m json.tool | head -20
curl http://localhost:8000/api/nlq/context/delinquency_rate_trend
```

Both should return JSON. Also confirm the new routes appear in Swagger:
`http://localhost:8000/docs` → look for the **NLQ** tag section.

---

### Step 3 — Run Copilot Prompt A (NlqService)

Run **Prompt A** to generate `angular-app/src/app/services/nlq.service.ts`.

Before running, set the NLQ backend URL in your environment file:

```typescript
// angular-app/src/environments/environment.ts
export const environment = {
  production: false,
  reportingEngineUrl: 'http://localhost:8000',
  nlqBaseUrl: 'http://<NLQ-DEV-MACHINE-IP>:<NLQ-PORT>'  // other developer's machine
};
```

Verify the service compiles:

```bash
cd angular-app
npx ng build --configuration development 2>&1 | grep -E "error|NlqService"
```

---

### Step 4 — Run Copilot Prompt B (dashboard buttons)

Run **Prompt B** to add the NLQ icon button to each chart card and KPI card.

**Critical: chart_id values must match exactly** — check the compiled template:

```bash
grep -r "data-chart-id\|openNlqChat" angular-app/src/app/components/reporting-dashboard/
```

Expected: 7 occurrences of `openNlqChat` — one per chart and KPI card.

Verify in browser: hover over any chart card — the 💬 button should appear in the top-right corner.

---

### Step 5 — Run Copilot Prompt C (NlqChatPanelComponent)

Run **Prompt C** to generate the slide-in chat panel component.

Register it in the dashboard module or as a standalone component import.
Add the panel to the dashboard template:

```html
<!-- At the bottom of reporting-dashboard.component.html -->
<app-nlq-chat-panel
  [chartId]="activeChartId"
  [isOpen]="nlqPanelOpen"
  (closed)="nlqPanelOpen = false">
</app-nlq-chat-panel>
```

Verify: click any chart's 💬 button — the panel should slide in from the right, showing the chart title in the header and suggestion chips below.

---

### Step 6 — Wire session context

The chat panel needs the logged-in user and current filter state. Add this to your dashboard component's `ngOnInit`:

```typescript
ngOnInit(): void {
  // ... existing chart loading ...

  // Wire session to NLQ service
  this.nlqService.setSessionContext({
    userName: this.authService.currentUser?.name ?? 'Unknown',
    activeFilters: {
      servicer_number: this.filterForm.get('servicerNumber')?.value ?? 'All',
      servicer_name:   this.filterForm.get('servicerName')?.value ?? 'All'
    }
  });
}
```

Also update the filters whenever the user clicks Apply:

```typescript
onApplyFilters(): void {
  // ... existing filter logic ...
  this.nlqService.setSessionContext({
    userName: this.authService.currentUser?.name ?? 'Unknown',
    activeFilters: {
      servicer_number: this.filterForm.get('servicerNumber')?.value,
      servicer_name:   this.filterForm.get('servicerName')?.value
    }
  });
}
```

---

### Step 7 — Copy chart_nlq_context.json to Angular assets

This must be done every time the JSON file is regenerated:

```bash
cp docs/nlq/chart_nlq_context.json angular-app/src/assets/nlq/chart_nlq_context.json
```

Add to `angular.json` assets array to ensure it is bundled:

```json
"assets": [
  "src/favicon.ico",
  "src/assets"
]
```

The file will be served at `http://localhost:4200/assets/nlq/chart_nlq_context.json`.
The Angular service loads it once at startup via `HttpClient.get()`.

---

## How the context flows into each NLQ message

Every call to `NlqService.sendNlqQuery()` sends this payload to the NLQ backend:

```json
{
  "chart_id": "delinquency_rate_trend",
  "user_query": "which servicer has the highest delinquency rate?",
  "session": {
    "userName": "Chi Nicholas",
    "activeFilters": {
      "servicer_number": "All",
      "servicer_name": "All"
    }
  },
  "chart_context": {
    "system_prompt_context": "This chart shows the % delinquency rate over time for each of the 8 active servicers...",
    "api_endpoint": "/api/rejected-events/by-servicer",
    "filters_supported": ["servicer id", "activity period"],
    "answerable_questions": ["Which servicer has the highest rate?", "..."]
  },
  "active_filters": {
    "servicer_number": "All",
    "servicer_name": "All"
  }
}
```

The NLQ backend uses `chart_context.system_prompt_context` as the LLM system message prefix.
This scopes every answer to what the chart actually shows — it cannot answer
questions about data outside that chart's API endpoint.

---

## Smart suggestion rules — implementation checklist

The `NlqChatPanelComponent` should apply these rules after each bot response:

| Condition | Suggestion shown |
|-----------|-----------------|
| Any response with row data | "Show as table" |
| `available_columns_not_shown[]` is non-empty | "Add [column] column" for each |
| User asked about one servicer | "Compare all servicers" |
| User saw all-servicer data | "Filter to [highest servicer]" |
| Chart is delinquency trend | "Which servicer improved most last quarter?" |
| Chart is portfolio balance | "Show as % of total portfolio" |
| Chart is any KPI card | "Break this down by servicer" |
| Always | "Export as CSV" |

### Unanswerable question guard

Before sending to NLQ backend, check:

```typescript
private isUnanswerable(query: string, context: ChartNlqContext): boolean {
  return context.unanswerable_questions.some(uq =>
    query.toLowerCase().includes(uq.toLowerCase().split('(')[0].trim().toLowerCase())
  );
}
```

If true, show a local message:
> "This question can't be answered from the current chart data. [reason from unanswerable_questions entry]"

No network call is made — prevents the NLQ backend from hallucinating.

---

## Keeping the context files in sync

| When | What to do |
|------|-----------|
| API response shape changes | Re-run Prompt D, copy to assets |
| New chart added to dashboard | Add entry to `chart_nlq_context.json` manually or re-run Prompt D |
| New CSV columns added | Re-run metadata guide Prompts 3, 5, then re-run Prompt D |
| FastAPI endpoint path changes | Update `api_endpoint` in `chart_nlq_context.json`, re-run Prompt E |
| NLQ developer asks "what endpoints exist?" | Point them to `GET http://<your-IP>:8000/api/nlq/context` |

---

## Network config for local-to-local

The NLQ developer uses your machine IP, not `localhost`:

```bash
# Find your IP (Windows PowerShell)
ipconfig
# Look for: IPv4 Address under your active Wi-Fi adapter
```

Confirm Docker exposes port 8000 in `docker-compose.yml`:

```yaml
ports:
  - "8000:8000"
```

If the NLQ developer gets a timeout, run once in elevated PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Docker Reporting Engine 8000" `
  -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

NLQ developer verifies connectivity:

```bash
curl http://<your-IP>:8000/api/nlq/context
curl http://<your-IP>:8000/api/rejected-events/summary
```

---

## Confirmed chart and API reference

| chart_id | API endpoint | Key response fields |
|----------|-------------|---------------------|
| `delinquency_rate_trend` | `/api/rejected-events/by-servicer` | `servicer_id`, `pct_of_total_delinquent`, `outstanding_rejected_events`, `activity_period` |
| `loan_count_region_servicer` | `/api/rejected-events/by-servicer` | `servicer_id`, `rejected_loans`, `activity_period` |
| `portfolio_balance` | `/api/rejected-events/by-servicer` | `servicer_id`, `outstanding_rejected_events`, `rejected_loans` |
| `servicer_status_dist` | `/api/rejected-events/summary` | `outstanding_events`, `pct_of_total_delinquent`, `as_of_timestamp` |
| `kpi_total_loans` | `/api/rejected-events/summary` | `rejected_loans` |
| `kpi_avg_delinquency` | `/api/rejected-events/summary` | `pct_of_total_delinquent` |
| `kpi_portfolio_balance` | `/api/rejected-events/summary` | `outstanding_events` |

Confirmed servicers (SVC-001 to SVC-008):
`Apex Mortgage Services` · `Beacon Loan Servicing` · `Cardinal Servicing Group` ·
`Delta Financial Partners` · `Evergreen Capital Servicing` · `Forks Home Loans` ·
`Granite Mortgage Co` · `Horizon Lending Services`

---

*Reporting Dashboard MFE — MSR17051-HT7 | NLQ Chatbot Integration | DRAFT*
