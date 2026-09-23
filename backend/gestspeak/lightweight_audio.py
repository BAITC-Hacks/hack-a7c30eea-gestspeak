"""CPU speaker diarization with local ONNX models; never downloads at runtime.

Model preparation is an explicit, separate step (scripts/prepare-light-models.py).
Speaker labels are anonymous clusters and require human name confirmation.
"""
import importlib.util
import os
from functools import lru_cache
from pathlib import Path


def model_paths():
    root = Path(os.environ.get("SHERPA_MODEL_PATH", "models/sherpa"))
    return root / "segmentation.onnx", root / "embedding.onnx"


def diarization_available():
    return importlib.util.find_spec("sherpa_onnx") is not None and all(p.is_file() for p in model_paths())


@lru_cache(maxsize=2)
def _pipeline(num_speakers=None):
    if not diarization_available():
        raise RuntimeError("Локальные ONNX-модели диаризации не установлены. Запустите scripts/prepare-light-models.py.")
    import sherpa_onnx
    segmentation, embedding = model_paths()
    threads = max(1, min(4, int(os.environ.get("AI_CPU_THREADS", "2"))))
    config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                model=str(segmentation), window_shift_ratio=0.1,
            ),
            num_threads=threads, provider="cpu",
        ),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(
            model=str(embedding), num_threads=threads, provider="cpu",
        ),
        clustering=sherpa_onnx.FastClusteringConfig(
            num_clusters=num_speakers if num_speakers else -1, threshold=0.5,
        ),
        min_duration_on=0.3, min_duration_off=0.5,
    )
    if not config.validate():
        raise RuntimeError("Не удалось проверить конфигурацию локальной диаризации.")
    return sherpa_onnx.OfflineSpeakerDiarization(config)


def speaker_turns(audio, num_speakers=None):
    """Return (start, end, SPEAKER_nn) tuples for mono float32 audio at 16 kHz."""
    import numpy as np
    samples = np.asarray(audio, dtype=np.float32)
    if samples.ndim != 1 or not np.isfinite(samples).all():
        raise ValueError("Ожидается моноаудио с конечными значениями с частотой 16000 Гц.")
    if num_speakers is not None and not 1 <= num_speakers <= 30:
        raise ValueError("Число говорящих должно быть от 1 до 30.")
    if not len(samples) or np.max(np.abs(samples)) < 1e-5:
        return []
    diarizer = _pipeline(num_speakers)
    if diarizer.sample_rate != 16000:
        raise RuntimeError("Модель диаризации должна поддерживать 16000 Гц.")
    return [(float(turn.start), float(turn.end), f"SPEAKER_{turn.speaker:02d}")
            for turn in diarizer.process(samples).sort_by_start_time()]
