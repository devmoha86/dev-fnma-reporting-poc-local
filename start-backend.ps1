# Run this in Terminal 1 (PowerShell)
# Usage: cd reporting-poc; .\start-backend.ps1

Set-Location "$PSScriptRoot\backend"

# Create virtual env if it doesn't exist
if (-Not (Test-Path ".venv")) {
    Write-Host "Creating Python virtual environment..."
    python -m venv .venv
}

# Activate it
& ".venv\Scripts\Activate.ps1"

# Install dependencies
pip install -q -r requirements.txt

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host " FastAPI starting on http://localhost:8000"
Write-Host " Interactive docs: http://localhost:8000/docs"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""

uvicorn main:app --reload --port 8000
