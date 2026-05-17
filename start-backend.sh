#!/usr/bin/env bash
# Terminal 1 — Start the FastAPI backend
# Works on: office laptop (pip via corporate proxy) and GitHub Codespaces
#
# Usage: bash start-backend.sh

set -e
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_ROOT/backend"

# ── Create virtual env if it doesn't exist ────────────────────────
if [ ! -d ".venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv .venv
fi

# ── Activate ──────────────────────────────────────────────────────
source .venv/bin/activate

# ── Install packages if needed ────────────────────────────────────
if ! python -c "import fastapi" 2>/dev/null; then
  echo "Installing Python packages..."
  pip install --quiet -r requirements.txt
fi

# ── Print environment info ────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  FastAPI backend"
echo "  Python: $(python --version)"
echo "  URL:    http://localhost:8000"
echo "  Docs:   http://localhost:8000/docs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  In Codespaces: click 'Open in Browser' on port 8000"
echo "  to verify: should return {\"status\":\"ok\",\"rows\":24}"
echo ""

# ── Start the server ──────────────────────────────────────────────
# --host 0.0.0.0 is required for Codespaces port forwarding.
# On a local laptop 127.0.0.1 also works, but 0.0.0.0 is safe for both.
python -W ignore::DeprecationWarning \
  -m uvicorn main:app \
  --reload \
  --host 0.0.0.0 \
  --port 8000
