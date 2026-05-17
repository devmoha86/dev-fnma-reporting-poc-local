#!/usr/bin/env bash
# .devcontainer/setup.sh
# Runs automatically after the Codespace container is created.
# Installs Python packages and npm packages so startup is instant.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Servicer Reporting MFE — Codespace setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Python virtual environment + packages ──────────────────────
echo ""
echo "[1/2] Installing Python packages (fastapi, uvicorn, pandas)..."
cd "$REPO_ROOT/backend"
python3 -m venv .venv
source .venv/bin/activate
pip install --quiet -r requirements.txt
echo "      ✅ Python packages ready"

# ── 2. npm install ────────────────────────────────────────────────
echo ""
echo "[2/2] Installing Angular npm packages..."
cd "$REPO_ROOT/angular-app"

# Codespaces has public internet access so we use the public registry,
# not the Fannie Mae Nexus (which is only reachable from the office network).
# Override .npmrc to use the public registry for Codespaces.
npm install --legacy-peer-deps \
  --registry https://registry.npmjs.org
echo "      ✅ npm packages ready"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup complete!"
echo ""
echo "  Run these in two separate terminals:"
echo "    Terminal 1:  bash start-backend.sh"
echo "    Terminal 2:  bash start-frontend.sh"
echo ""
echo "  Or use the shortcut script:"
echo "    bash start-all.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
