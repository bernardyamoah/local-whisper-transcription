import pytest
from fastapi.testclient import TestClient

from studio.app import create_app
from studio.exports import filename, render, timestamp
from studio.store import Store
from tests.conftest import import_audio, new_job, wait_state


def test_client_bootstrap_respects_strict_csp(client):
    response = client.get("/")
    assert response.status_code == 200
    for script in response.text.split("<script")[1:]:
        attributes = script.split(">", 1)[0]
        assert "src=" in attributes
    policy = response.headers["content-security-policy"]
    assert "script-src 'self'" in policy
    assert "unsafe-inline" not in policy


def test_full_pipeline_edit_export_playback_delete(client, audio, app):
    created = new_job(client, audio)
    job = wait_state(client, created["id"])
    assert job["detected_language"] == "en"
    assert len(job["segments"]) == 2
    segment = job["segments"][0]
    response = client.patch(
        "/api/jobs/" + job["id"],
        json={
            "revision": 0,
            "title": "My / edited: story",
            "segments": [{"id": segment["id"], "text": "Corrected words."}],
        },
    )
    assert response.json()["revision"] == 1
    detail = client.get("/api/jobs/" + job["id"]).json()
    assert detail["segments"][0]["text"] == "Corrected words."
    assert detail["segments"][0]["original"] == "Every voice has a story."
    assert detail["segments"][0]["start"] == segment["start"]
    conflict = client.patch("/api/jobs/" + job["id"], json={"revision": 0, "segments": []})
    assert conflict.status_code == 409
    for kind in ["txt", "srt", "vtt"]:
        response = client.get(f"/api/jobs/{job['id']}/export/{kind}")
        assert response.status_code == 200
        assert "Corrected words." in response.text
        assert "My%20%20edited%20story" in response.headers["content-disposition"]
    response = client.get(f"/api/jobs/{job['id']}/audio", headers={"Range": "bytes=0-20"})
    assert response.status_code == 206
    assert len(response.content) == 21
    diagnostics = client.get("/api/diagnostics").text
    assert "recording.wav" not in diagnostics and "Corrected" not in diagnostics
    assert str(app.state.store.root) not in diagnostics
    assert not list((app.state.store.root / "temporary").iterdir())
    deleted = client.request("DELETE", "/api/jobs/" + job["id"], json={"scope": "all", "confirm": True})
    assert deleted.status_code == 200
    assert client.get("/api/jobs/" + job["id"]).status_code == 404
    assert not list((app.state.store.root / "sources").iterdir())
    assert not list((app.state.store.root / "playback").iterdir())


def test_cancel_and_retry(client, audio, app):
    job = new_job(client, audio)
    wait_state(client, job["id"], ("preparing", "transcribing"))
    assert client.post(f"/api/jobs/{job['id']}/cancel").status_code == 200
    cancelled = wait_state(client, job["id"], ("cancelled",))
    assert cancelled["source_available"]
    assert client.post(f"/api/jobs/{job['id']}/retry").status_code == 200
    finished = wait_state(client, job["id"])
    assert finished["attempt"] == 2


def test_import_validation(client, audio):
    for content in [b"", b"not audio"]:
        assert client.post("/api/media", content=content).status_code == 400
    response = client.post("/api/media", content=audio, headers={"X-Filename": "../../escape.mp3"})
    assert response.status_code == 201
    assert response.json()["codec"] == "pcm_s16le"
    assert (
        client.post("/api/jobs", json={"media_id": response.json()["id"], "preset": "balanced"}).status_code
        == 409
    )
    assert client.post("/api/jobs", json={"media_id": "../../escape"}).status_code == 422


def test_retention(client, audio, app):
    assert client.put("/api/settings", json={"retain_source": False}).status_code == 200
    job = wait_state(client, new_job(client, audio)["id"])
    # The worker applies retention immediately after committing the completed transcript.
    import time

    for _ in range(50):
        job = client.get("/api/jobs/" + job["id"]).json()
        if not job["source_available"]:
            break
        time.sleep(0.02)
    assert not job["source_available"]
    assert not job["playback_available"]
    assert job["segments"]
    assert client.get("/api/jobs/" + job["id"] + "/audio").status_code == 404


def test_keep_source_then_reuse(client, audio):
    job = wait_state(client, new_job(client, audio)["id"])
    assert (
        client.request(
            "DELETE", "/api/jobs/" + job["id"], json={"scope": "transcript", "confirm": True}
        ).status_code
        == 200
    )
    sources = client.get("/api/media").json()
    assert sources[0]["id"] == job["media_id"]
    response = client.post("/api/jobs", json={"media_id": job["media_id"], "preset": "fast"})
    assert response.status_code == 201
    wait_state(client, response.json()["id"])


def test_restart_recovery_and_state_machine(tmp_path, audio):
    app = create_app(tmp_path, worker=False)
    with TestClient(app, headers={"X-Studio-Request": "1"}) as client:
        media = import_audio(client, audio)
        job = app.state.jobs.create(media["id"], "Test", "auto", "fast", "base")
        with app.state.store.connect() as db:
            app.state.jobs.transition(db, job["id"], "preparing")
        with pytest.raises(ValueError):
            with app.state.store.connect() as db:
                app.state.jobs.transition(db, job["id"], "completed")
    restarted = create_app(tmp_path, worker=False)
    with TestClient(restarted) as client:
        assert client.get("/api/jobs/" + job["id"]).json()["state"] == "interrupted"
        assert restarted.state.jobs.retry(job["id"])["state"] == "queued"


def test_host_csrf_boundary(client):
    assert client.get("/", headers={"Host": "evil.test"}).status_code == 403
    assert (
        client.get(
            "/",
            headers={
                "Host": "transcribe.bernardyamoah.com",
                "X-Forwarded-Proto": "https",
                "Cf-Access-Jwt-Assertion": "forged",
            },
        ).status_code
        == 403
    )
    assert client.put("/api/settings", json={}, headers={"Origin": "https://evil.test"}).status_code == 403
    assert client.put("/api/settings", json={}, headers={"X-Studio-Request": ""}).status_code == 403
    assert client.get("/").headers["content-security-policy"].startswith("default-src 'self'")


def test_settings_validate(client):
    for payload in [
        {"language": "made-up"},
        {"max_duration_hours": 0},
        {"hardware": "mps"},
        {"preset": "unknown"},
    ]:
        assert client.put("/api/settings", json=payload).status_code == 422
    assert client.post("/api/models/fast", json={"confirm": False}).status_code == 422


def test_model_catalog_and_delete_api(client, app):
    environment = client.get("/api/environment").json()
    models = {model["id"]: model for model in environment["models"]}
    assert models["base"]["installed"]
    assert "tiny.en" in models
    assert client.post("/api/models/not-a-model", json={"confirm": True}).status_code == 404
    response = client.request("DELETE", "/api/models/base", json={"confirm": True})
    assert response.json() == {"deleted": True, "model": "base"}
    assert not app.state.models.path("base").exists()
    assert not client.get("/api/environment").json()["presets"]["fast"]["installed"]


def test_installed_catalog_model_can_run_job(client, app, audio):
    path = app.state.models.path("tiny.en")
    path.mkdir()
    for name in [".ready", "model.bin", "config.json", "tokenizer.json"]:
        (path / name).write_text("model")
    media = import_audio(client, audio)
    response = client.post(
        "/api/jobs",
        json={"media_id": media["id"], "preset": "fast", "model": "tiny.en"},
    )
    assert response.status_code == 201
    assert response.json()["model"] == "tiny.en"
    assert wait_state(client, response.json()["id"])["state"] == "completed"


def test_active_job_model_cannot_be_deleted(tmp_path, audio):
    app = create_app(tmp_path, worker=False)
    path = app.state.models.path("base")
    path.mkdir()
    for name in [".ready", "model.bin", "config.json", "tokenizer.json"]:
        (path / name).write_text("model")
    with TestClient(app, headers={"X-Studio-Request": "1"}) as client:
        media = import_audio(client, audio)
        created = client.post("/api/jobs", json={"media_id": media["id"], "preset": "fast"})
        assert created.status_code == 201
        response = client.request("DELETE", "/api/models/base", json={"confirm": True})
        assert response.status_code == 409
        assert path.exists()


def test_edit_transaction_rolls_back(client, audio):
    job = wait_state(client, new_job(client, audio)["id"])
    edits = [{"id": job["segments"][0]["id"], "text": "Should roll back"}, {"id": 999999, "text": "Invalid"}]
    response = client.patch("/api/jobs/" + job["id"], json={"revision": 0, "segments": edits})
    assert response.status_code == 400
    assert client.get("/api/jobs/" + job["id"]).json()["segments"][0]["text"] == "Every voice has a story."


def test_export_cue_normalization():
    segments = [{"start": 1, "end": 2, "text": "A < B"}, {"start": 1.5, "end": 1.9, "text": "Overlap"}]
    text = render(segments, "srt")
    assert "00:00:02,000 --> 00:00:02,001" in text
    assert render(segments, "vtt").startswith("WEBVTT\n\n")
    assert "A &lt; B" in render(segments, "vtt")
    assert "[00:00:01.000]" in render(segments, "txt", True)
    assert timestamp(3600.001) == "01:00:00.001"
    assert filename("../../:") == "transcript"
    with pytest.raises(ValueError):
        render(segments, "html")


def test_paths_confined(tmp_path):
    store = Store(tmp_path)
    for identifier in ["../escape", "/etc/passwd", "hello/world", ""]:
        with pytest.raises(ValueError):
            store.path("sources", identifier)
    external = tmp_path.parent / "outside"
    external.mkdir(exist_ok=True)
    (tmp_path / "sources" / "symlink").symlink_to(external)
    with pytest.raises(ValueError):
        store.path("sources", "symlink")


def test_signed_access_jwt(monkeypatch):
    import time

    import jwt
    from cryptography.hazmat.primitives.asymmetric import rsa

    from studio.security import Boundary

    monkeypatch.setenv("CF_ACCESS_TEAM_DOMAIN", "studio-test.cloudflareaccess.com")
    monkeypatch.setenv("CF_ACCESS_AUDIENCE", "studio-audience")
    monkeypatch.setenv("CF_ACCESS_EMAIL", "owner@example.com")
    boundary = Boundary()
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    class SigningKey:
        pass

    public = SigningKey()
    public.key = key.public_key()
    monkeypatch.setattr(boundary.jwks, "get_signing_key_from_jwt", lambda token: public)
    claims = {
        "iss": "https://studio-test.cloudflareaccess.com",
        "aud": "studio-audience",
        "email": "owner@example.com",
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
    }
    assert boundary.validate(jwt.encode(claims, key, algorithm="RS256")) == "owner@example.com"
    for changes in [
        {"email": "someone@example.com"},
        {"exp": 1},
        {"aud": "wrong"},
        {"iss": "https://evil.test"},
    ]:
        with pytest.raises((ValueError, jwt.PyJWTError)):
            boundary.validate(jwt.encode(claims | changes, key, algorithm="RS256"))
    wrong_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(jwt.PyJWTError):
        boundary.validate(jwt.encode(claims, wrong_key, algorithm="RS256"))


def test_pipeline_failure_keeps_source(tmp_path, audio):
    import sys

    app = create_app(tmp_path, command=[sys.executable, "-c", "raise SystemExit(1)"])
    with TestClient(app, headers={"X-Studio-Request": "1"}) as client:
        media = import_audio(client, audio)
        job = app.state.jobs.create(media["id"], "Failure test", "auto", "fast", "base")
        failed = wait_state(client, job["id"], ("failed",))
        assert failed["source_available"]
        assert failed["error"]
        assert not list((tmp_path / "temporary").iterdir())


def test_reject_playlist_reference(client):
    payload = b"#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nfile:///tmp/private.wav\n"
    assert (
        client.post("/api/media", content=payload, headers={"X-Filename": "recording.mp3"}).status_code == 400
    )


@pytest.mark.parametrize(
    "extension,codec",
    [
        ("mp3", "libmp3lame"),
        ("wav", "pcm_s16le"),
        ("m4a", "aac"),
        ("aac", "aac"),
        ("flac", "flac"),
        ("ogg", "libvorbis"),
        ("mp4", "aac"),
        ("mov", "aac"),
        ("mkv", "aac"),
        ("webm", "libopus"),
    ],
)
def test_supported_containers(client, tmp_path, extension, codec):
    import subprocess

    path = tmp_path / f"sample.{extension}"
    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1",
            "-c:a",
            codec,
            "-y",
            str(path),
        ],
        check=True,
        capture_output=True,
    )
    response = client.post("/api/media", content=path.read_bytes(), headers={"X-Filename": path.name})
    assert response.status_code == 201, response.text
    assert 0.5 < response.json()["duration"] < 2
