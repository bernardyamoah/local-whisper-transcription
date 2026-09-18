"""Deterministic subprocess fixture; never selectable by the production application."""

import json
import subprocess
import sys
import time
from pathlib import Path

source, normalized, playback, model_path, language, hardware, output, events, provider = sys.argv[1:]


def emit(stage, progress):
    with open(events, "a") as f:
        f.write(json.dumps({"stage": stage, "progress": progress, "backend": "test"}) + "\n")


subprocess.run(
    ["ffmpeg", "-nostdin", "-v", "error", "-i", source, "-ac", "1", "-ar", "16000", "-y", normalized],
    check=True,
)
emit("transcribing", 20)
time.sleep(0.6)
emit("transcribing", 75)
time.sleep(0.6)
emit("saving", 96)
playback_source = source if Path(playback).suffix == ".mp4" else normalized
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", playback_source, "-y", playback], check=True)
Path(output).write_text(
    json.dumps(
        {
            "language": "en",
            "version": "test",
            "segments": [
                {
                    "start": 0,
                    "end": 0.9,
                    "text": "Every voice has a story.",
                    "confidence": 0.96,
                    "speaker": 0,
                },
                {
                    "start": 1,
                    "end": 1.9,
                    "text": "Give yours a little space.",
                    "confidence": 0.94,
                    "speaker": 1,
                },
            ],
            "summary": "A short conversation about capturing ideas and giving every voice room.",
            "chapters": [
                {"start": 0, "title": "The story behind a voice"},
                {"start": 1, "title": "Making space for ideas"},
            ],
            "topics": ["Voice notes", "Creative ideas"],
        }
    )
)
