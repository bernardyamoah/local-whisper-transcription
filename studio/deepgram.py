from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class DeepgramError(RuntimeError):
    pass


class Deepgram:
    def __init__(self, root: Path, opener=urlopen):
        self.path = Path(root) / ".deepgram-key"
        self.opener = opener

    def configured(self) -> bool:
        return bool(self.key())

    def key(self) -> str:
        environment = os.getenv("DEEPGRAM_API_KEY", "").strip()
        if environment:
            return environment
        try:
            return self.path.read_text().strip()
        except FileNotFoundError:
            return ""

    def connect(self, key: str) -> None:
        key = key.strip()
        if len(key) < 20:
            raise DeepgramError("Enter a valid Deepgram API key.")
        self.validate(key)
        self.path.write_text(key)
        self.path.chmod(0o600)

    def disconnect(self) -> None:
        self.path.unlink(missing_ok=True)

    def validate(self, key: str) -> None:
        request = Request(
            "https://api.deepgram.com/v1/auth/token",
            headers={"Authorization": f"Token {key}"},
        )
        try:
            with self.opener(request, timeout=20) as response:
                if response.status != 200:
                    raise DeepgramError("Deepgram rejected this API key.")
        except HTTPError as error:
            raise DeepgramError("Deepgram rejected this API key.") from error
        except URLError as error:
            raise DeepgramError("Deepgram could not be reached.") from error


def transcribe_file(path: Path, key: str, language: str, opener=urlopen) -> dict:
    parameters = {
        "model": "nova-3-general",
        "smart_format": "true",
        "punctuate": "true",
        "utterances": "true",
        "diarize_model": "latest",
        "summarize": "v2",
        "topics": "true",
    }
    if language == "auto":
        parameters["detect_language"] = "true"
    else:
        parameters["language"] = language
    request = Request(
        "https://api.deepgram.com/v1/listen?" + urlencode(parameters),
        data=path.read_bytes(),
        method="POST",
        headers={
            "Authorization": f"Token {key}",
            "Content-Type": "audio/wav",
        },
    )
    try:
        with opener(request, timeout=600) as response:
            payload = json.load(response)
    except HTTPError as error:
        message = "Deepgram could not transcribe this recording."
        try:
            detail = json.loads(error.read()).get("err_msg")
            if detail:
                message = detail
        except (json.JSONDecodeError, AttributeError):
            pass
        raise DeepgramError(message) from error
    except URLError as error:
        raise DeepgramError("Deepgram could not be reached.") from error

    results = payload.get("results", {})
    utterances = results.get("utterances", [])
    channels = results.get("channels", [])
    detected = ""
    if channels:
        detected = channels[0].get("detected_language", "")
    words = channels[0].get("alternatives", [{}])[0].get("words", []) if channels else []
    segments = [
        {
            "start": item["start"],
            "end": item["end"],
            "text": item.get("transcript", "").strip(),
            "confidence": item.get("confidence"),
            "speaker": item.get("speaker"),
            "words": item.get("words", []),
        }
        for item in utterances
        if item.get("transcript", "").strip()
    ]
    summary = results.get("summary", {}).get("short", "").strip()
    topic_segments = results.get("topics", {}).get("segments", [])
    chapters = []
    topics = []
    for item in topic_segments:
        ranked = sorted(item.get("topics", []), key=lambda topic: topic.get("confidence", 0), reverse=True)
        if not ranked:
            continue
        title = ranked[0].get("topic", "").strip()
        if not title:
            continue
        start_word = item.get("start_word", 0)
        start = words[start_word].get("start", 0) if 0 <= start_word < len(words) else 0
        chapters.append({"start": start, "title": title})
        if title not in topics:
            topics.append(title)
    return {
        "segments": segments,
        "language": detected or (language if language != "auto" else "unknown"),
        "version": "nova-3-general",
        "summary": summary,
        "chapters": chapters,
        "topics": topics,
    }
