from types import SimpleNamespace

from studio.engine import transcribe


def test_empty_transcription_retries_with_relaxed_speech_thresholds():
    segment = SimpleNamespace(start=1.0, end=2.0, text=" Found speech. ", avg_logprob=-0.5)
    info = SimpleNamespace(duration=3.0, language="en")

    class Model:
        def __init__(self):
            self.calls = []

        def transcribe(self, source, **options):
            self.calls.append((source, options))
            return (iter(()) if len(self.calls) == 1 else iter((segment,))), info

    model = Model()
    result, detected = transcribe(model, "audio.wav", "auto")

    assert result == [{"start": 1.0, "end": 2.0, "text": "Found speech.", "confidence": -0.5}]
    assert detected is info
    assert len(model.calls) == 2
    assert model.calls[0][1]["language"] is None
    assert model.calls[1][1]["no_speech_threshold"] == 0.9
    assert model.calls[1][1]["log_prob_threshold"] == -2.0
