#!/usr/bin/env python3
"""Exercise real local ASR and diarization; accepts a synthetic or anonymized file.

Example: .venv/bin/python scripts/smoke-local-audio.py recording.wav --language ru
Model files must have been downloaded explicitly before this offline check.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("--language", default="ru", choices=["ru", "kk", "auto"])
    parser.add_argument("--speakers", type=int, default=None)
    parser.add_argument("--model-path", type=Path, default=ROOT / "models" / "whisper-tiny")
    parser.add_argument("--output", type=Path, default=ROOT / "output" / "audio-smoke" / "result.json")
    args = parser.parse_args()
    audio_path = args.audio.resolve()
    output_path = args.output.resolve()
    os.environ["WHISPER_MODEL_PATH"] = str(args.model_path.resolve())
    os.chdir(ROOT)
    from gestspeak.engine import transcribe
    started = time.monotonic()
    segments, duration = transcribe(audio_path, args.language, args.speakers,
                                    lambda stage, percent: print(f"{stage}: {percent}%", flush=True))
    result = {"input": args.audio.name, "language": args.language, "duration_seconds": duration,
              "processing_seconds": round(time.monotonic() - started, 2),
              "runtime_network": "offline model loading",
              "segments": [s.model_dump() for s in segments]}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
    if not segments:
        raise SystemExit("No speech recognized; check this recording and the local model.")


if __name__ == "__main__":
    main()
