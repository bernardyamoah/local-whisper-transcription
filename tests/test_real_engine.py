"""Opt-in local-model test. Does not download models or send audio anywhere."""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest


def test_real_engine(tmp_path):
    model, audio = os.getenv("STUDIO_TEST_MODEL"), os.getenv("STUDIO_TEST_AUDIO")
    if not model or not audio:
        pytest.skip("Set STUDIO_TEST_MODEL and STUDIO_TEST_AUDIO to existing local fixtures")
    output, events = tmp_path / "result.json", tmp_path / "events.jsonl"
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "studio.engine",
            str(Path(audio).resolve()),
            str(tmp_path / "audio.wav"),
            str(tmp_path / "playback.mp3"),
            str(Path(model).resolve()),
            "en",
            "cpu",
            str(output),
            str(events),
        ],
        capture_output=True,
        timeout=120,
        check=False,
    )
    assert result.returncode == 0, events.read_text() if events.exists() else "No engine events"
    transcript = json.loads(output.read_text())
    assert transcript["language"] == "en"
    assert transcript["segments"]
    assert any(s["text"].strip() for s in transcript["segments"])
    assert all(0 <= s["start"] <= s["end"] for s in transcript["segments"])
    assert (tmp_path / "playback.mp3").stat().st_size > 0
