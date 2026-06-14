#!/usr/bin/env bash
# Terminal 2 — Start the Angular app
# Works on: office laptop (Nexus registry) and GitHub Codespaces (public registry)
#
# Usage: bash start-frontend.sh

set -e
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_ROOT/angular-app"

# ── Detect environment ────────────────────────────────────────────
# CODESPACE_NAME is set automatically by GitHub Codespaces.
if [ -n "$CODESPACE_NAME" ]; then
  ENV="codespaces"
  NPM_REGISTRY="https://registry.npmjs.org"

  # In Codespaces, Angular running on :4200 calls the FastAPI backend
  # on :8000. Codespaces exposes each port on a unique public URL, so
  # the Angular app can't hardcode "localhost:8000" — it needs the
  # Codespaces-forwarded URL for port 8000.
  #
  # We patch environment.ts apiUrl before serving.
  # Prefer local forwarded tunnel URL because it is usually the most reliable
  # path from browser -> Codespaces ports, and avoids cross-origin/session issues.
  BACKEND_URL="${BACKEND_URL_OVERRIDE:-http://localhost:8000}"
  echo ""
  echo "  Codespaces detected."
  echo "  Backend URL will be: $BACKEND_URL"
  echo ""

  # Patch apiUrl in Angular environment config for Codespaces.
  sed -i -E "s|apiUrl:[[:space:]]*'[^']*'|apiUrl: '${BACKEND_URL}'|g" \
    src/environments/environment.ts

else
  ENV="local"
  # Ensure local runs always target local backend.
  sed -i -E "s|apiUrl:[[:space:]]*'[^']*'|apiUrl: 'http://localhost:8000'|g" \
    src/environments/environment.ts
  # Check if Nexus registry is reachable
  if curl -I -s --connect-timeout 3 "https://nexusrepository.fanniemae.com" >/dev/null; then
    NPM_REGISTRY="https://nexusrepository.fanniemae.com/repository/npm-public/"
    echo ""
    echo "  Office laptop detected — using Nexus registry."
    echo "  Make sure VPN is connected."
    echo ""
  else
    NPM_REGISTRY="https://registry.npmjs.org"
    echo ""
    echo "  Nexus registry unreachable — falling back to public registry."
    echo "  (Assuming personal compute without VPN)"
    echo ""
  fi
fi

# ── npm install if needed ─────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "Installing npm packages from $NPM_REGISTRY ..."
  npm install \
    --ignore-scripts \
    --legacy-peer-deps \
    --registry "$NPM_REGISTRY"
fi

# ── Print info ────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Angular 18.2.x — Reporting MFE"
echo "  Node: $(node --version)   npm: $(npm --version)"
echo "  URL:  http://localhost:4200"
echo "  Env:  $ENV"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Serve ─────────────────────────────────────────────────────────
# --host 0.0.0.0 required for Codespaces port forwarding.
# --disable-host-check avoids the "Invalid Host header" error in Codespaces.
npx ng serve \
  --host 0.0.0.0 \
  --port 4200 \
  --disable-host-check \
  --proxy-config proxy.conf.json
