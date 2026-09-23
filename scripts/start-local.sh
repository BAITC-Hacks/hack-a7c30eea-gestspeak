#!/usr/bin/env bash
# Fast launch after dependencies and frontend build already exist.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x .venv/bin/python ]; then
  echo 'Сначала выполните bash scripts/dev.sh для установки зависимостей.'
  exit 1
fi
if [ ! -f frontend/dist/client/index.html ] && [ ! -f frontend/out/index.html ]; then
  echo 'Сначала выполните: cd frontend && npm ci && npm run build'
  exit 1
fi
if [ -f .env ]; then set -a; source .env; set +a; fi
export PYTHONPATH=backend
exec .venv/bin/python -m uvicorn gestspeak.main:app --host 127.0.0.1 --port 8000
