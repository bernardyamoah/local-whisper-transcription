import io
import sys
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from studio.app import create_app


@pytest.fixture
def audio():
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(16000)
        file.writeframes(b"\x00\x00" * 32000)
    return buffer.getvalue()


@pytest.fixture
def app(tmp_path):
    app = create_app(tmp_path, command=[sys.executable, str(Path(__file__).parent / "fake_engine.py")])
    path = app.state.store.path("models", "base")
    path.mkdir()
    for file in [".ready", "model.bin", "config.json", "tokenizer.json"]:
        (path / file).write_text("test")
    return app


@pytest.fixture
def client(app):
    with TestClient(app, headers={"X-Studio-Request": "1"}) as client:
        yield client


def import_audio(client, audio):
    response = client.post("/api/media", content=audio, headers={"X-Filename": "recording.wav"})
    assert response.status_code == 201, response.text
    return response.json()


def new_job(client, audio):
    media = import_audio(client, audio)
    response = client.post(
        "/api/jobs", json={"media_id": media["id"], "preset": "fast", "title": "A conversation"}
    )
    assert response.status_code == 201, response.text
    return response.json()


def wait_state(client, identifier, states=("completed",), timeout=10):
    import time

    until = time.monotonic() + timeout
    while time.monotonic() < until:
        job = client.get("/api/jobs/" + identifier).json()
        if job["state"] in states:
            return job
        time.sleep(0.05)
    raise AssertionError(f"Expected {states}, got {job}")
