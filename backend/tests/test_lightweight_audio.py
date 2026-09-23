"""Optional CPU audio validation; the baseline install need not contain NumPy."""
import pytest

np = pytest.importorskip("numpy")
from gestspeak import lightweight_audio


def test_silence_does_not_create_speakers_or_load_models(monkeypatch):
    def unexpected(*args):
        raise AssertionError("A silent recording should never invoke inference")
    monkeypatch.setattr(lightweight_audio, "_pipeline", unexpected)
    assert lightweight_audio.speaker_turns(np.zeros(16000, dtype=np.float32)) == []


@pytest.mark.parametrize("samples", [np.zeros((2, 160)), np.array([float("nan")])])
def test_malformed_audio_is_rejected_before_inference(samples):
    with pytest.raises(ValueError, match="моноаудио"):
        lightweight_audio.speaker_turns(samples)


def test_invalid_speaker_count_is_rejected():
    with pytest.raises(ValueError, match="от 1 до 30"):
        lightweight_audio.speaker_turns(np.ones(160), num_speakers=100)
