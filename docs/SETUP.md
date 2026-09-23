# Установка и локальные модели

[← На главную](../README.md) · [API](API.md) · [Безопасность](SECURITY.md) · [Фактические проверки](VALIDATION.md)

Все команды выполняются из корня репозитория. Подготовка зависимостей и весов требует интернета; записи совещаний на этом этапе не используются. Обработка встреч выполняется локально.

## Базовая установка

Нужны Node.js 22.13+, npm и Python 3.9+. Для полного AI-профиля рекомендуется Python 3.11.

```bash
git clone https://github.com/BAITC-Hacks/hack-a7c30eea-gestspeak.git
cd hack-a7c30eea-gestspeak
bash scripts/setup.sh
bash scripts/start-local.sh
```

Приложение: **http://127.0.0.1:8000**. Swagger: **http://127.0.0.1:8000/docs**.

Для выбора Python при первой установке: `GESTSPEAK_PYTHON=python3.11 bash scripts/setup.sh`. Повторный запуск — только `bash scripts/start-local.sh`. Данные и статусы сохраняются в `data/`; скрипты не удаляют их. Если порт занят работающей копией, откройте её адрес.

Для разработки: `bash scripts/dev.sh`, затем http://localhost:3000. Производственный запуск обслуживает интерфейс и API с одного адреса и не требует Node.js в runtime.

## Фоновое развёртывание на Mac


После установки зависимостей и сборки остановите ручной запуск сервера и выполните:

```bash
.venv/bin/python scripts/deploy-macos.py install
.venv/bin/python scripts/deploy-macos.py status
```

Служба запускается при входе в macOS и перезапускается при сбое. Адрес: **http://127.0.0.1:8000**. Терминал можно закрыть; Mac должен оставаться включённым и активным. Логи находятся в `data/logs/`, настройки читаются из `.env`. Для применения изменений: `.venv/bin/python scripts/deploy-macos.py restart`. Для удаления автозапуска: `.venv/bin/python scripts/deploy-macos.py uninstall`; данные сохраняются. Публичный URL этим способом не создаётся. Для внутреннего сервера используйте раздел Docker ниже.

## Локальные модели


Используются открытые проекты [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [pyannote.audio](https://github.com/pyannote/pyannote-audio), [Ollama](https://github.com/ollama/ollama) и [Qwen2.5](https://ollama.com/library/qwen2.5). Внешние облачные AI API, в том числе NVIDIA hosted API, противоречат ограничению кейса; NVIDIA GPU можно использовать **локально**.

### Облегчённый CPU-профиль

Для проверки полного пути аудио на обычном ноутбуке доступна конфигурация **Whisper tiny + sherpa-onnx** без PyTorch, около 125 МБ весов. После базовой установки:

```bash
.venv/bin/python -m pip install -r backend/requirements-light.txt
.venv/bin/python scripts/prepare-light-models.py
# В .env установите WHISPER_MODEL_PATH=models/whisper-tiny
bash scripts/start-local.sh
```

Скрипт подготовки скачивает публичные веса в `models/whisper-tiny` и `models/sherpa`, затем обработка использует только локальные файлы. Укажите в `.env` `WHISPER_MODEL_PATH=models/whisper-tiny`; остальные значения по умолчанию: `SHERPA_MODEL_PATH=models/sherpa`, `AI_CPU_THREADS=2`. Этот профиль предназначен для проверки сквозного сценария; качество tiny на казахском и смешанной речи не измерено и может быть низким. Для оценки целевого качества подготовьте мультиязычный large-v3 по следующей инструкции.

Диаризация использует [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), преобразованную [pyannote segmentation 3.0](https://huggingface.co/pyannote/segmentation-3.0) и [NVIDIA NeMo TitaNet-S](https://catalog.ngc.nvidia.com/orgs/nvidia/teams/nemo/models/titanet_small). Это локальные модели; ключ NVIDIA API не нужен. Лицензии и происхождение доступны в соответствующих репозиториях и карточках моделей.

### Подготовка на машине с интернетом

Подготовка не использует записи совещаний. Полный набор ASR, pyannote, PyTorch и Qwen требует нескольких гигабайт диска и достаточной памяти. Для 8 ГБ RAM полная конфигурация тяжела; уменьшение модели требует отдельной оценки качества.

```bash
# Отдельная среда не затрагивает базовую .venv и данные приложения.
python3.11 -m venv .venv-ai
source .venv-ai/bin/activate
pip install -r backend/requirements.txt -r backend/requirements-ai.txt huggingface_hub==0.34.4
python scripts/prepare-models.py
```

Для диаризации сначала примите условия модели [speaker-diarization-community-1](https://huggingface.co/pyannote/speaker-diarization-community-1). Задайте личный `HF_TOKEN` через защищённое окружение, затем:

```bash
python scripts/prepare-models.py --include-diarization
```

Скачивание использует `snapshot_download`, а не указатели Git LFS. Проверьте `models/whisper/model.bin` и `models/diarization/config.yaml`. Облегчённый вариант ASR для проб: `python scripts/prepare-models.py --whisper Systran/faster-whisper-small`; это компромисс качества, особенно для казахского языка.

Установите Ollama согласно её репозиторию:

```bash
ollama serve
# В другом терминале:
ollama pull qwen2.5:7b
```

### Запуск внутри контура

Перенесите зависимости и веса в закрытый контур. В `.env`:

```dotenv
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b
WHISPER_MODEL_PATH=models/whisper
DIARIZATION_MODEL_PATH=models/diarization
AI_DEVICE=cpu
WHISPER_COMPUTE=int8
```

При использовании совместимого NVIDIA GPU: `AI_DEVICE=cuda`, `WHISPER_COMPUTE=float16`; CUDA/cuDNN и версии PyTorch/CTranslate2 должны соответствовать целевой машине. Включение переменной само по себе не предоставляет контейнеру GPU.

В runtime выставлены `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, `HF_HUB_DISABLE_TELEMETRY=1`, `PYANNOTE_METRICS_ENABLED=0`. Whisper использует `local_files_only=True`. Приложение не скачивает веса при загрузке встречи.

Остановите базовый сервер, если он занимает порт, и запустите приложение в подготовленной AI-среде:

```bash
GESTSPEAK_VENV=.venv-ai bash scripts/start-local.sh
```

Проверьте **«Система»**, затем выполните короткий прогон RU/KK записи. Статус здоровья проверяет доступность компонентов, а не измеряет точность. После сопоставления голосов с именами можно повторно проанализировать транскрипт; это заменяет извлечённые поручения после успешной обработки.

## Docker

Базовый режим с интерфейсом, текстом, демо и экспортами:

```bash
docker compose up --build api
```

Откройте **http://127.0.0.1:8000**. Для полной CPU-конфигурации предварительно скачайте Whisper/pyannote в `models/`, а Ollama — в общий volume:

```bash
# Только на этапе подготовки с интернетом, без данных совещаний:
docker compose --profile setup run --rm ollama-prepare
WITH_AI=1 docker compose --profile ai build
# Runtime в изолированной сети:
WITH_AI=1 docker compose --profile ai up -d
```

Для облегчённой обработки аудио после `prepare-light-models.py`:

```bash
WITH_AI=light DOCKER_WHISPER_MODEL_PATH=/app/models/whisper-tiny docker compose up --build api
```

Без отдельной Ollama извлечение выполняется локальными правилами.

Профиль `setup` использует отдельную сеть подготовки и монтирует только веса Ollama. Профиль `ai` работает в сети `internal: true`; загрузить модель из него нельзя. Для полностью отключённого сервера также перенесите собранные Docker-образы и volume весов. Токен задаётся в `.env` через `GESTSPEAK_API_TOKEN` и вводится в интерфейсе.

Docker healthcheck проверяет доступность API; отсутствие весов показывает `/api/health`. Docker/GPU-развёртывание необходимо проверить на целевом сервере: локальный отчёт не приписывает ему непроведённые проверки.

