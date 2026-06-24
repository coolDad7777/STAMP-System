#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
fi

SESSION_BACKEND="stamp-backend"
SESSION_GATEWAY="stamp-demo-4747"

tmux -f /exec-daemon/tmux.portal.conf kill-session -t "$SESSION_BACKEND" 2>/dev/null || true
tmux -f /exec-daemon/tmux.portal.conf kill-session -t "$SESSION_GATEWAY" 2>/dev/null || true

tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_BACKEND" -c "$ROOT/backend" -- "${SHELL:-bash}" -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_BACKEND:0.0" 'npm run dev' C-m

sleep 2

tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_GATEWAY" -c "$ROOT" -- "${SHELL:-bash}" -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_GATEWAY:0.0" 'npm run dev:demo' C-m

echo "STAMP stack starting:"
echo "  API:      http://127.0.0.1:3000/health"
echo "  Gateway:  http://127.0.0.1:4747/"
echo "  Client:   http://127.0.0.1:4747/client"
echo "  Facility: http://127.0.0.1:4747/facility-qr.html"
