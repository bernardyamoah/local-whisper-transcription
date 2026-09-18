import io
import json
import sys
import subprocess
import time
import zipfile
from pathlib import Path

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
    assert "style-src 'self' 'sha256-" in policy
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
    assert detail["template"]["id"] == "general"
    bookmark = client.post(
        f"/api/jobs/{job['id']}/bookmarks",
        json={"at": 0.5, "kind": "Decision"},
    )
    assert bookmark.status_code == 201
    assert bookmark.json()["kind"] == "Decision"
    assert (
        client.post(
            f"/api/jobs/{job['id']}/bookmarks",
            json={"at": 0.5, "kind": "Blocker"},
        ).status_code
        == 400
    )
    bookmarked = client.get("/api/jobs/" + job["id"]).json()
    assert bookmarked["bookmarks"][0]["at"] == 0.5
    assert client.delete(f"/api/jobs/{job['id']}/bookmarks/{bookmark.json()['id']}").status_code == 200
    assert detail["segments"][0]["text"] == "Corrected words."
    assert detail["segments"][0]["original"] == "Every voice has a story."
    assert detail["segments"][0]["start"] == segment["start"]
    assert detail["notes"] == {
        "summary": "A short conversation about capturing ideas and giving every voice room.",
        "chapters": [
            {"start": 0, "title": "The story behind a voice"},
            {"start": 1, "title": "Making space for ideas"},
        ],
        "topics": ["Voice notes", "Creative ideas"],
    }
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


def test_video_import_creates_video_playback(client, video, app):
    media = client.post("/api/media", content=video, headers={"X-Filename": "interview.mp4"})
    assert media.status_code == 201
    assert media.json()["has_video"] is True
    created = client.post(
        "/api/jobs",
        json={"media_id": media.json()["id"], "preset": "fast", "title": "Video interview"},
    )
    assert created.status_code == 201
    job = wait_state(client, created.json()["id"])
    assert job["has_video"] is True
    assert job["playback_kind"] == "video"
    assert job["playback_available"] is True
    assert app.state.store.path("playback", job["id"], ".mp4").is_file()
    response = client.get(f"/api/jobs/{job['id']}/video", headers={"Range": "bytes=0-31"})
    assert response.status_code == 206
    assert response.headers["content-type"] == "video/mp4"
    assert len(response.content) == 32
    assert client.get(f"/api/jobs/{job['id']}/audio").status_code == 404
    deleted = client.request("DELETE", f"/api/jobs/{job['id']}", json={"scope": "all", "confirm": True})
    assert deleted.status_code == 200
    assert not app.state.store.path("playback", job["id"], ".mp4").exists()


def test_rich_exports_bundle_and_obsidian_destination(client, audio, app, tmp_path):
    created = new_job(client, audio)
    job = wait_state(client, created["id"])
    client.post(
        f"/api/jobs/{job['id']}/bookmarks",
        json={"at": 0.5, "kind": "Action", "note": "Send the revised brief"},
    )

    markdown = client.get(f"/api/jobs/{job['id']}/export/md?view=minutes")
    assert markdown.status_code == 200
    assert "## Action items" in markdown.text
    assert "Send the revised brief" in markdown.text

    actions = client.get(f"/api/jobs/{job['id']}/export/json?view=actions")
    assert json.loads(actions.text)["content"][0]["kind"] == "Action"
    assert client.get(f"/api/jobs/{job['id']}/export/csv?view=actions").text.startswith("type,time,text")

    pdf = client.get(f"/api/jobs/{job['id']}/export/pdf?view=minutes")
    assert pdf.content.startswith(b"%PDF-1.4")
    assert pdf.headers["content-type"] == "application/pdf"

    docx = client.get(f"/api/jobs/{job['id']}/export/docx?view=minutes")
    with zipfile.ZipFile(io.BytesIO(docx.content)) as archive:
        assert "Send the revised brief" in archive.read("word/document.xml").decode()

    bundle = client.get(f"/api/jobs/{job['id']}/export/bundle")
    with zipfile.ZipFile(io.BytesIO(bundle.content)) as archive:
        assert {"transcript.md", "meeting-minutes.md", "transcript.json", "manifest.json"} <= set(
            archive.namelist()
        )
        assert any(name.startswith("media/") for name in archive.namelist())

    vault = tmp_path / "vault"
    vault.mkdir()
    configured = client.put(
        "/api/export-destinations",
        json={"obsidian_vault": str(vault), "obsidian_folder": "Meetings"},
    )
    assert configured.json()["obsidian_vault"] == str(vault)
    delivered = client.post(
        f"/api/jobs/{job['id']}/deliver/obsidian", json={"view": "minutes"}
    )
    assert delivered.status_code == 200
    note = next((vault / "Meetings").glob("*.md"))
    assert "Send the revised brief" in note.read_text()


def test_cancel_and_retry(client, audio, app):
    job = new_job(client, audio)
    wait_state(client, job["id"], ("preparing", "transcribing"))
    assert client.post(f"/api/jobs/{job['id']}/cancel").status_code == 200
    cancelled = wait_state(client, job["id"], ("cancelled",))
    assert cancelled["source_available"]
    assert client.post(f"/api/jobs/{job['id']}/retry").status_code == 200
    finished = wait_state(client, job["id"])
    assert finished["attempt"] == 2


def test_completed_empty_transcript_can_retry(client, audio, app):
    created = new_job(client, audio)
    job = wait_state(client, created["id"])
    assert client.post(f"/api/jobs/{job['id']}/retry").status_code == 400
    with app.state.store.connect() as db:
        db.execute("DELETE FROM segments WHERE job_id=?", (job["id"],))
    response = client.post(f"/api/jobs/{job['id']}/retry")
    assert response.status_code == 200
    finished = wait_state(client, job["id"])
    assert finished["attempt"] == 2
    assert finished["segments"]


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
        job = app.state.jobs.create(media["id"], "Test", "auto", "fast", "small")
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
        {"hardware": "cuda"},
        {"preset": "unknown"},
        {"appearance": "neon"},
    ]:
        assert client.put("/api/settings", json=payload).status_code == 422
    assert client.post("/api/models/fast", json={"confirm": False}).status_code == 422


def test_model_catalog_and_delete_api(client, app):
    environment = client.get("/api/environment").json()
    models = {model["id"]: model for model in environment["models"]}
    assert models["small"]["installed"]
    assert "turbo" in models
    assert client.post("/api/models/not-a-model", json={"confirm": True}).status_code == 404
    response = client.request("DELETE", "/api/models/small", json={"confirm": True})
    assert response.json() == {"deleted": True, "model": "small"}
    assert not app.state.models.path("small").exists()
    assert not client.get("/api/environment").json()["presets"]["fast"]["installed"]


def test_installed_catalog_model_can_run_job(client, app, audio):
    path = app.state.models.path("turbo")
    path.mkdir()
    for name in [".ready", "config.json", "weights.npz"]:
        (path / name).write_text("model")
    media = import_audio(client, audio)
    response = client.post(
        "/api/jobs",
        json={"media_id": media["id"], "preset": "fast", "model": "turbo"},
    )
    assert response.status_code == 201
    assert response.json()["model"] == "turbo"
    assert wait_state(client, response.json()["id"])["state"] == "completed"


def test_active_job_model_cannot_be_deleted(tmp_path, audio):
    app = create_app(tmp_path, worker=False)
    path = app.state.models.path("small")
    path.mkdir()
    for name in [".ready", "config.json", "weights.npz"]:
        (path / name).write_text("model")
    with TestClient(app, headers={"X-Studio-Request": "1"}) as client:
        media = import_audio(client, audio)
        created = client.post("/api/jobs", json={"media_id": media["id"], "preset": "fast"})
        assert created.status_code == 201
        response = client.request("DELETE", "/api/models/small", json={"confirm": True})
        assert response.status_code == 409
        assert path.exists()


def test_edit_transaction_rolls_back(client, audio):
    job = wait_state(client, new_job(client, audio)["id"])
    edits = [{"id": job["segments"][0]["id"], "text": "Should roll back"}, {"id": 999999, "text": "Invalid"}]
    response = client.patch("/api/jobs/" + job["id"], json={"revision": 0, "segments": edits})
    assert response.status_code == 400
    assert client.get("/api/jobs/" + job["id"]).json()["segments"][0]["text"] == "Every voice has a story."


def test_named_speaker_and_full_text_library_search(client, audio, app):
    job = wait_state(client, new_job(client, audio)["id"])
    with app.state.store.connect() as db:
        db.execute("UPDATE segments SET speaker=0 WHERE job_id=?", (job["id"],))
    response = client.patch(
        f"/api/jobs/{job['id']}",
        json={"revision": 0, "speakers": [{"speaker": 0, "name": "Bernard"}]},
    )
    assert response.status_code == 200
    detail = client.get(f"/api/jobs/{job['id']}").json()
    assert detail["segments"][0]["speaker_name"] == "Bernard"
    assert client.get("/api/jobs?q=voice").json()["total"] == 1
    assert client.get("/api/jobs?q=Bernard").json()["total"] == 1
    exported = client.get(f"/api/jobs/{job['id']}/export/txt").text
    assert "Bernard: Every voice has a story." in exported


def test_export_cue_normalization():
    segments = [{"start": 1, "end": 2, "text": "A < B"}, {"start": 1.5, "end": 1.9, "text": "Overlap"}]
    text = render(segments, "srt")
    assert "00:00:02,000 --> 00:00:02,001" in text
    assert render(segments, "vtt").startswith("WEBVTT\n\n")
    assert "A &lt; B" in render(segments, "vtt")
    assert "[00:00:01.000]" in render(segments, "txt", True)
    assert "Speaker 2: A < B" in render([{**segments[0], "speaker": 1}], "txt")
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


def test_native_recording_becomes_completed_live_transcript(tmp_path):
    command = [sys.executable, str(Path(__file__).parent / "fake_native_bridge.py")]
    app = create_app(tmp_path, worker=False, native_command=command)
    with TestClient(app, headers={"X-Studio-Request": "1"}) as client:
        environment = client.get("/api/environment").json()
        assert environment["native"]["recording"] is True
        started = client.post(
            "/api/recordings",
            json={"name": "Weekly planning", "language": "en", "template": "standup"},
        )
        assert started.status_code == 201
        assert started.json()["state"] == "recording"
        assert started.json()["template"] == "standup"
        live = []
        for _ in range(30):
            live = client.get("/api/recordings").json()["live_transcript"]
            if live:
                break
            time.sleep(0.02)
        assert live[0]["text"] == "We should ship the live meeting view."
        bookmark = client.post("/api/recordings/bookmarks", json={"kind": "Blocker"})
        assert bookmark.status_code == 201
        assert bookmark.json()["at"] >= 0
        assert client.post("/api/recordings/bookmarks", json={"kind": "Key point"}).status_code == 400
        assert client.post("/api/recordings", json={"name": "Another"}).status_code == 409
        stopped = client.post("/api/recordings/stop")
        assert stopped.status_code == 201
        assert stopped.json()["title"] == "Weekly planning"
        assert stopped.json()["state"] == "completed"
        assert stopped.json()["duration"] == 1
        transcript = client.get(f"/api/jobs/{stopped.json()['id']}").json()
        assert transcript["segments"][0]["text"] == "We should ship the live meeting view."
        assert transcript["playback_available"] is True
        assert client.get("/api/media").json() == []
        with app.state.store.connect() as db:
            stored = db.execute(
                "SELECT kind FROM bookmarks WHERE media_id=?", (stopped.json()["media_id"],)
            ).fetchone()
        assert stored["kind"] == "Blocker"
        assert client.get("/api/recordings").json() == {"state": "idle"}


def test_long_meeting_with_placeholder_video_has_readable_audio_playback(tmp_path, monkeypatch):
    from studio.native import NativeBridge

    app = create_app(tmp_path, worker=False)
    recording_file = tmp_path / "meeting.mp4"
    subprocess.run([
        "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=s=2x2:r=1",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
        "-t", "75", "-c:v", "libx264", "-c:a", "aac", str(recording_file),
    ], check=True)
    monkeypatch.setattr(NativeBridge, "stop", lambda self: {
        "id": "long-meeting", "path": recording_file, "name": "Long meeting",
        "language": "en", "template": "general",
        "started": time.time() - 75,
        "live_transcript": [{"source": "Meeting", "start": 65, "end": 74,
                             "text": "This is the end of a longer meeting."}],
        "interim": {},
    })
    with TestClient(app, headers={"X-Studio-Request": "1"}) as client:
        stopped = client.post("/api/recordings/stop")
        assert stopped.status_code == 201, stopped.text
        job = stopped.json()
        assert job["duration"] >= 75
        assert job["playback_kind"] == "audio"
        assert job["playback_available"] is True
        detail = client.get(f"/api/jobs/{job['id']}").json()
        assert detail["segments"][0]["text"].endswith("longer meeting.")
        assert client.get(f"/api/jobs/{job['id']}/audio").status_code == 200


def test_completed_transcript_receives_smart_moments(tmp_path, audio):
    class FakeJev:
        def configured(self):
            return True

        def classify(self, segments, template):
            return [
                {
                    "at": segment["start"],
                    "kind": "Decision",
                    "confidence": 0.94,
                    "importance": 2.1,
                }
                for segment in segments
            ]

    command = [sys.executable, str(Path(__file__).parent / "fake_engine.py")]
    app = create_app(tmp_path, command=command, jev=FakeJev())
    model = app.state.models.path("small")
    model.mkdir()
    for name in [".ready", "config.json", "weights.npz"]:
        (model / name).write_text("test")
    with TestClient(app, headers={"X-Studio-Request": "1"}) as client:
        settings = client.get("/api/settings").json() | {"smart_moments": True}
        assert client.put("/api/settings", json=settings).status_code == 200
        created = new_job(client, audio)
        wait_state(client, created["id"])
        bookmarks = []
        for _ in range(50):
            bookmarks = client.get(f"/api/jobs/{created['id']}").json()["bookmarks"]
            if bookmarks:
                break
            time.sleep(0.02)
        assert bookmarks[0]["kind"] == "Decision"
        assert bookmarks[0]["source"] == "jev"


def test_deepgram_provider_does_not_require_local_model(tmp_path, audio):
    class FakeDeepgram:
        connected = True

        def configured(self):
            return self.connected

        def key(self):
            return "test-key"

        def connect(self, key):
            self.connected = True

        def disconnect(self):
            self.connected = False

    command = [sys.executable, str(Path(__file__).parent / "fake_engine.py")]
    app = create_app(tmp_path, command=command, deepgram=FakeDeepgram())
    with TestClient(app, headers={"X-Studio-Request": "1"}) as client:
        media = import_audio(client, audio)
        created = client.post(
            "/api/jobs",
            json={"media_id": media["id"], "provider": "deepgram", "title": "Cloud meeting"},
        )
        assert created.status_code == 201
        assert created.json()["provider"] == "deepgram"
        completed = wait_state(client, created.json()["id"])
        assert completed["state"] == "completed"


def test_pipeline_failure_keeps_source(tmp_path, audio):
    import sys

    app = create_app(tmp_path, command=[sys.executable, "-c", "raise SystemExit(1)"])
    with TestClient(app, headers={"X-Studio-Request": "1"}) as client:
        media = import_audio(client, audio)
        job = app.state.jobs.create(media["id"], "Failure test", "auto", "fast", "small")
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
