#!/usr/bin/env bash
# start-all.sh
# Starts both backend and frontend in split terminal panes.
# Works in GitHub Codespaces (tmux is pre-installed).
#
# Usage: bash start-all.sh

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Check if tmux is available
if command -v tmux &>/dev/null; then
  echo "Starting backend + frontend in tmux split panes..."

  tmux new-session -d -s reporting -x "$(tput cols)" -y "$(tput lines)"

  # Top pane: FastAPI backend
  tmux send-keys -t reporting \
    "cd '$REPO_ROOT' && bash start-backend.sh" Enter

  # Split horizontally, bottom pane: Angular
  tmux split-window -v -t reporting
  tmux send-keys -t reporting \
    "cd '$REPO_ROOT' && bash start-frontend.sh" Enter

  # Attach so the user sees both
  tmux attach-session -t reporting

else
  # Fallback: run backend in background, frontend in foreground
  echo "tmux not found — starting backend in background..."
  cd "$REPO_ROOT"
  bash start-backend.sh &
  BACKEND_PID=$!
  echo "Backend PID: $BACKEND_PID"
  echo ""
  echo "Starting Angular in foreground (Ctrl+C stops both)..."
  bash start-frontend.sh
  kill $BACKEND_PID 2>/dev/null
fi
