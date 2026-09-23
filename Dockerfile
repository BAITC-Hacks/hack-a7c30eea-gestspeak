FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./
RUN npm run build && mkdir -p /web/public-export && if [ -f /web/out/index.html ]; then cp -a /web/out/. /web/public-export/; else cp -a /web/dist/client/. /web/public-export/; fi

FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgomp1 && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt backend/requirements-ai.txt backend/requirements-light.txt /tmp/
ARG WITH_AI=0
RUN pip install --no-cache-dir -r /tmp/requirements.txt && if [ "$WITH_AI" = "1" ]; then pip install --no-cache-dir -r /tmp/requirements-ai.txt; elif [ "$WITH_AI" = "light" ]; then pip install --no-cache-dir -r /tmp/requirements-light.txt; fi
COPY backend /app/backend
COPY examples /app/examples
COPY assets /app/assets
COPY --from=web /web/public-export /app/frontend/out
ENV PYTHONPATH=/app/backend HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 PYANNOTE_METRICS_ENABLED=0
RUN useradd --uid 10001 --create-home gestspeak && mkdir /app/data /app/models && chown -R gestspeak /app/data
USER gestspeak
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD python -c "import os, urllib.request; token=os.getenv('GESTSPEAK_API_TOKEN',''); urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8000/api/health',headers={'Authorization':'Bearer '+token} if token else {}),timeout=8)"
CMD ["uvicorn", "gestspeak.main:app", "--host", "0.0.0.0", "--port", "8000"]
