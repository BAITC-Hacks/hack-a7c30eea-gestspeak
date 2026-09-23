#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install -r backend/requirements.txt
(cd frontend && npm ci --cache .npm-cache --no-audit --no-fund)
if [ -f .env ]; then set -a; source .env; set +a; fi
PYTHONPATH=backend .venv/bin/python -m uvicorn gestspeak.main:app --host 127.0.0.1 --port 8000 &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT INT TERM
cd frontend
npm run dev
