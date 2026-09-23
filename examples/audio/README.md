# Синтетические аудиозаписи

- `synthetic-russian.wav`: локально созданная русская речь, один голос macOS Milena; эталон текста в `synthetic-russian.txt`.
- `synthetic-two-speakers.wav`: последовательно два разных синтетических голоса, русский Milena и английский Samantha, с паузой. Проверяет технический путь диаризации; не является тестом казахской или шала-казахской речи.

Формат: WAV, mono, 16 kHz, PCM 16 bit. Реальные записи и персональные данные не используются.

```bash
.venv/bin/python scripts/smoke-local-audio.py examples/audio/synthetic-russian.wav --language ru --speakers 1
.venv/bin/python scripts/smoke-local-audio.py examples/audio/synthetic-two-speakers.wav --language auto --speakers 2
```

Перед запуском установите `backend/requirements-light.txt` и выполните `scripts/prepare-light-models.py`. Скрипт использует локальный `models/whisper-tiny`, результат записывает в `output/audio-smoke/result.json`. Для рабочего качества русского/казахского и смешанной речи нужен полноценный профиль Whisper large-v3 и оценка на аудиозаписях предметной области; успешный smoke не измеряет WER или DER.
