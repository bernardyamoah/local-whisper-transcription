from studio.engine import ProgressReporter, transcribe


def test_progress_reporter_converts_model_output_to_monotonic_job_progress():
    observed = []
    reporter = ProgressReporter(lambda **event: observed.append(event), 60, "local")

    reporter.write(" 12%|██")
    reporter.write(" 8%|█")
    reporter.write(" 51.5%|█████")
    reporter.write(" 100%|██████████")

    assert [event["progress"] for event in observed] == [15.7, 50.8, 94.0]
    assert all(event["stage"] == "transcribing" for event in observed)


def test_empty_transcription_retries_with_relaxed_speech_thresholds():
    segment = {"start": 1.0, "end": 2.0, "text": " Found speech. ", "avg_logprob": -0.5}

    class Transcriber:
        def __init__(self):
            self.calls = []

        def __call__(self, source, **options):
            self.calls.append((source, options))
            return {"segments": [] if len(self.calls) == 1 else [segment], "language": "en"}

    transcriber = Transcriber()
    result, detected = transcribe(transcriber, "audio.wav", "auto")

    assert result == [{"start": 1.0, "end": 2.0, "text": "Found speech.", "confidence": -0.5}]
    assert detected == "en"
    assert len(transcriber.calls) == 2
    assert transcriber.calls[0][1]["language"] is None
    assert "beam_size" not in transcriber.calls[0][1]
    assert transcriber.calls[0][1]["word_timestamps"] is False
    assert transcriber.calls[1][1]["no_speech_threshold"] == 0.9
    assert transcriber.calls[1][1]["log_prob_threshold"] == -2.0
