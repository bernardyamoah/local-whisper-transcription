"""Deterministic subprocess fixture; never selectable by the production application."""

import json
import subprocess
import sys
import time
from pathlib import Path

source, normalized, playback, model_path, language, hardware, output, events = sys.argv[1:]


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
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", normalized, "-y", playback], check=True)
Path(output).write_text(
    json.dumps(
        {
            "language": "en",
            "version": "test",
            "segments": [
                {"start": 0, "end": 0.9, "text": "Every voice has a story.", "confidence": -0.1},
                {"start": 1, "end": 1.9, "text": "Give yours a little space.", "confidence": -0.2},
            ],
        }
    )
)
