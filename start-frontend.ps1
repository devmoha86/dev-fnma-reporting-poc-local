# Run this in Terminal 2 (after the backend is running)
# Usage: cd reporting-poc; .\start-frontend.ps1

Set-Location "$PSScriptRoot\angular-app"

if (-Not (Test-Path "node_modules")) {
    Write-Host "Installing npm packages via Nexus registry (--ignore-scripts --legacy-peer-deps)..."
    npm install --ignore-scripts --legacy-peer-deps
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host " Angular starting on http://localhost:4200"
Write-Host " Browser will open automatically"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""

npx ng serve --port 4200 --open
