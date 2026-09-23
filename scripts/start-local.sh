#!/usr/bin/env bash
# Fast launch after dependencies and frontend build already exist.
set -euo pipefail
cd "$(dirname "$0")/.."
GESTSPEAK_VENV="${GESTSPEAK_VENV:-.venv}"
if [ ! -x "$GESTSPEAK_VENV/bin/python" ]; then
  echo 'Сначала выполните bash scripts/setup.sh для установки и сборки.'
  exit 1
fi
if [ ! -f frontend/dist/client/index.html ] && [ ! -f frontend/out/index.html ]; then
  echo 'Сначала выполните bash scripts/setup.sh для установки и сборки.'
  exit 1
fi
if [ -f .env ]; then set -a; source .env; set +a; fi
export PYTHONPATH=backend
exec "$GESTSPEAK_VENV/bin/python" -m uvicorn gestspeak.main:app --host 127.0.0.1 --port 8000
