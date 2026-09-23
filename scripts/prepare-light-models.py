#!/usr/bin/env python3
"""Explicitly download small public weights before moving into a closed network.

This script downloads weights only. It never reads or uploads meeting recordings.
Whisper tiny is a CPU smoke profile, not the recommended Kazakh quality profile.
"""
import concurrent.futures
import shutil
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "models"
WHISPER = "https://huggingface.co/Systran/faster-whisper-tiny/resolve/main/"
RELEASES = "https://github.com/k2-fsa/sherpa-onnx/releases/download/"


def download(url, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size:
        print(f"Already exists: {target.relative_to(ROOT)}", flush=True)
        return
    partial = target.with_suffix(target.suffix + ".part")
    try:
        with urllib.request.urlopen(url, timeout=120) as source, partial.open("wb") as out:
            shutil.copyfileobj(source, out)
        partial.replace(target)
    finally:
        partial.unlink(missing_ok=True)
    print(f"Downloaded: {target.relative_to(ROOT)} ({target.stat().st_size // 1024} KiB)", flush=True)


def main():
    files = [(WHISPER + name, ROOT / "whisper-tiny" / name)
             for name in ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt")]
    files += [
        (RELEASES + "speaker-recongition-models/nemo_en_titanet_small.onnx", ROOT / "sherpa" / "embedding.onnx"),
        (RELEASES + "speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2", ROOT / "sherpa" / "segmentation.tar.bz2"),
    ]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(lambda item: download(*item), files))
    archive = ROOT / "sherpa" / "segmentation.tar.bz2"
    with tarfile.open(archive) as source:
        member = next(m for m in source.getmembers() if m.name.endswith("/model.int8.onnx"))
        with source.extractfile(member) as model, (ROOT / "sherpa" / "segmentation.onnx").open("wb") as out:
            shutil.copyfileobj(model, out)
    archive.unlink()
    print("CPU profile ready. Set WHISPER_MODEL_PATH=models/whisper-tiny. Runtime uses local files only.", flush=True)


if __name__ == "__main__":
    main()
