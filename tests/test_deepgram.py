import io
import json

from studio.deepgram import Deepgram, transcribe_file


class Response(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def test_deepgram_transcript_keeps_utterances_and_speakers(tmp_path):
    audio = tmp_path / "audio.wav"
    audio.write_bytes(b"wave")
    captured = {}
    payload = {
        "results": {
            "channels": [
                {
                    "detected_language": "en",
                    "alternatives": [
                        {"words": [{"word": "welcome", "start": 0.2, "end": 0.6, "confidence": 0.98}]}
                    ],
                }
            ],
            "summary": {"short": "The team opened the meeting."},
            "topics": {
                "segments": [
                    {
                        "start_word": 0,
                        "end_word": 1,
                        "topics": [{"topic": "Introductions", "confidence": 0.91}],
                    }
                ]
            },
            "utterances": [
                {
                    "start": 0.2,
                    "end": 1.4,
                    "transcript": " Welcome everyone. ",
                    "confidence": 0.97,
                    "speaker": 1,
                    "words": [{"word": "welcome", "start": 0.2, "end": 0.6, "confidence": 0.98}],
                }
            ],
        }
    }

    def open_request(request, timeout):
        captured["request"] = request
        captured["timeout"] = timeout
        return Response(json.dumps(payload).encode())

    result = transcribe_file(audio, "secret-key", "auto", opener=open_request)

    assert result == {
        "segments": [
            {
                "start": 0.2,
                "end": 1.4,
                "text": "Welcome everyone.",
                "confidence": 0.97,
                "speaker": 1,
                "words": [{"word": "welcome", "start": 0.2, "end": 0.6, "confidence": 0.98}],
            }
        ],
        "language": "en",
        "version": "nova-3-general",
        "summary": "The team opened the meeting.",
        "chapters": [{"start": 0.2, "title": "Introductions"}],
        "topics": ["Introductions"],
    }
    assert "detect_language=true" in captured["request"].full_url
    assert "diarize_model=latest" in captured["request"].full_url
    assert "summarize=v2" in captured["request"].full_url
    assert "topics=true" in captured["request"].full_url
    assert captured["request"].get_header("Authorization") == "Token secret-key"
    assert captured["request"].data == b"wave"


def test_deepgram_key_is_private_and_can_be_removed(tmp_path):
    client = Deepgram(tmp_path, opener=lambda request, timeout: Response(b"{}"))
    client.connect("a" * 32)

    assert client.configured()
    assert client.path.stat().st_mode & 0o777 == 0o600
    assert client.key() == "a" * 32

    client.disconnect()
    assert not client.configured()
