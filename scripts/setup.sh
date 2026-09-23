#!/usr/bin/env bash
# Install the application and build a same-origin production UI.
set -euo pipefail
cd "$(dirname "$0")/.."

GESTSPEAK_PYTHON="${GESTSPEAK_PYTHON:-python3}"
command -v "$GESTSPEAK_PYTHON" >/dev/null || { echo 'Нужен Python 3.9+; рекомендуется Python 3.11.'; exit 1; }
command -v npm >/dev/null || { echo 'Установите Node.js 22.13+ и npm.'; exit 1; }
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22 || (major===22 && minor<13)){ console.error("Нужен Node.js 22.13+"); process.exit(1); }'
"$GESTSPEAK_PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else "Нужен Python 3.9+; для AI рекомендуется Python 3.11")'

if [ ! -x .venv/bin/python ]; then
  "$GESTSPEAK_PYTHON" -m venv .venv
fi
if [ ! -f .env ]; then cp .env.example .env; fi
.venv/bin/python -m pip install -r backend/requirements.txt
(cd frontend && npm ci --no-audit --no-fund && npm run build)
echo 'Готово. Запуск: bash scripts/start-local.sh'
echo 'Приложение: http://127.0.0.1:8000 · API: http://127.0.0.1:8000/docs'
