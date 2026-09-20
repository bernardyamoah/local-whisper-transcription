import json
import os
import subprocess
import sys
import time
import urllib.request


def test_native_service_starts_on_loopback_and_cleans_up(tmp_path):
    ready = tmp_path / "ready.json"
    process = subprocess.Popen(
        [sys.executable, "-m", "studio.service", "--ready-file", str(ready)],
        env=os.environ | {"STUDIO_DATA": str(tmp_path / "data")},
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    try:
        for _ in range(100):
            if ready.exists():
                break
            assert process.poll() is None, "Service exited during startup"
            time.sleep(.1)
        payload = json.loads(ready.read_text())
        assert payload["url"].startswith("http://127.0.0.1:")
        with urllib.request.urlopen(payload["url"] + "/api/settings") as response:
            assert json.load(response)["transcription_provider"] == "local"
        process.terminate()
        assert process.wait(timeout=20) in (0, -15)
        assert not ready.exists()
        assert (tmp_path / 'data' / 'studio.sqlite3').exists()
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=20)


def test_environment_survives_broken_ffmpeg(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from studio.app import create_app
    original = subprocess.run
    def broken_version(args, **kwargs):
        if args[-1] == '-version':
            return subprocess.CompletedProcess(args, 1, stdout='', stderr='Library could not load')
        return original(args, **kwargs)
    monkeypatch.setattr(subprocess, 'run', broken_version)
    with TestClient(create_app(tmp_path, worker=False)) as client:
        response = client.get('/api/environment')
        assert response.status_code == 200
        assert response.json()['ffmpeg'] is None
