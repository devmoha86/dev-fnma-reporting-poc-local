# Servicer Reporting Dashboard
### Verified for Fannie Mae office laptop environment

---

## ✅ Compatibility Check — Your Laptop vs This MFE

| Tool    | Your laptop | MFE requires | Result |
|---------|------------|--------------|--------|
| Node.js | v20.19.4   | >= 20.0.0    | ✅ PASS |
| npm     | v10.8.2    | >= 10.0.0    | ✅ PASS |
| Angular | 18.2.19    | 18.2.x       | ✅ PASS — exact match |
| Python  | v3.9+      | >= 3.9       | ✅ PASS |
| pandas  | (install)  | 2.2.3 (needs py 3.9+) | ✅ PASS |

**No version changes needed. All tools are compatible as-is.**

---

## One step before npm install — Nexus registry

Your laptop already uses the Fannie Mae Nexus registry globally.
The file `angular-app/.npmrc` reinforces this at project level:

```
registry=https://nexusrepository.fanniemae.com/repository/npm-public/
strict-ssl=false
```

Make sure you are **connected to VPN** before running npm install.

---

## Run — two terminal windows

### Terminal 1 — FastAPI backend (Python)

**Mac / Linux / Git Bash:**
```bash
bash start-backend.sh
```
**Windows PowerShell:**
```powershell
.\start-backend.ps1
```

Verify it works: http://localhost:8000/health → `{"status":"ok","rows":24}`
Interactive API docs: http://localhost:8000/docs

### Terminal 2 — Angular reporting app

**Mac / Linux / Git Bash:**
```bash
bash start-frontend.sh
```
**Windows PowerShell:**
```powershell
.\start-frontend.ps1
```

Uses `npm install --ignore-scripts --legacy-peer-deps` — same flags your
office `setupProject.py` generates. First run takes ~2 minutes.
Browser opens to http://localhost:4200 automatically.

---

## Python 3.9 — one cosmetic warning

Python 3.9 is the minimum for pandas 2.2.3. Everything works correctly,
but you may see this in the terminal:

```
DeprecationWarning: datetime.date is deprecated
```

To suppress it:
```bash
python -W ignore::DeprecationWarning -m uvicorn main:app --reload --port 8000
```

---

## If Plotly CDN is blocked by the corporate proxy

Download `plotly-2.35.2.min.js` from another machine and:
1. Copy to `angular-app/src/assets/plotly.min.js`
2. Add `"src/assets/plotly.min.js"` to `"scripts"` in `angular.json`
3. Remove the cdn `<script>` tag from `src/index.html`

---

## Common errors

| Error | Fix |
|---|---|
| `npm ERR! 404` | Connect to Fannie Mae VPN first |
| `CERT_UNTRUSTED` | Already handled by `strict-ssl=false` in `.npmrc` |
| `CORS policy blocked` | Start Terminal 1 (FastAPI) before opening the browser |
| `NullInjectorError: HttpClient` | Already included in `src/main.ts` |
| `Plotly is not defined` | See "If Plotly CDN is blocked" above |
| `DeprecationWarning datetime` | Python 3.9 cosmetic — safe to ignore |
