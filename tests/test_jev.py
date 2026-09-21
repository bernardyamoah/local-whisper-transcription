import io
import json
import time

from fastapi.testclient import TestClient

from studio.app import create_app
from studio.jev import Jev, SmartMoments
from studio.store import Store


def test_post_recording_analysis_preserves_manual_and_survives_failure(client, app, audio):
    from tests.conftest import new_job, wait_state
    from studio.jev import JevError

    class Provider:
        fail = False
        def configured(self):
            return True
        def classify(self, segments, template):
            if self.fail:
                raise JevError("Service unavailable")
            return [{"at": s["start"], "kind": "Action", "confidence": .95, "importance": 2.5} for s in segments]

    job = wait_state(client, new_job(client, audio)["id"])
    manual = client.post(f"/api/jobs/{job['id']}/bookmarks", json={"at": 0, "kind": "Decision"}).json()
    provider = Provider()
    smart = SmartMoments(app.state.store, provider)
    smart.start()
    try:
        for _ in range(2):
            smart.rescan(job["id"], summary=True)
            smart.pending.join()
            assert smart.analysis_status(job["id"])["state"] == "completed"
        detail = client.get(f"/api/jobs/{job['id']}").json()
        assert manual["id"] in [b["id"] for b in detail["bookmarks"]]
        assert len([b for b in detail["bookmarks"] if b["source"] == "jev"]) == 1
        assert job["segments"][0]["text"] in detail["notes"]["summary"]
        provider.fail = True
        smart.rescan(job["id"], summary=True)
        smart.pending.join()
        assert smart.analysis_status(job["id"])["state"] == "failed"
        after = client.get(f"/api/jobs/{job['id']}").json()
        assert after["bookmarks"] == detail["bookmarks"]
        assert after["notes"] == detail["notes"]
    finally:
        smart.close()


class Response(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def test_jev_key_is_private_and_classification_is_typed(tmp_path):
    requests = []

    def open_request(request, timeout):
        requests.append((request, timeout))
        body = json.loads(request.data)
        if "kind_0" not in body["questions"]:
            return Response(json.dumps({"answers": {"reachable": {"noul": 1}}}).encode())
        return Response(
            json.dumps(
                {
                    "answers": {
                        "kind_0": {"choice": "kind_1", "confidence": 0.91},
                        "importance_0": {"score": 2.4, "confidence": 0.88},
                    }
                }
            ).encode()
        )

    client = Jev(tmp_path, opener=open_request)
    client.connect("t" * 32)
    result = client.classify([{"start": 12.5, "text": "We will ship Friday."}], "general")

    assert client.path.stat().st_mode & 0o777 == 0o600
    assert result == [{"at": 12.5, "kind": "Decision", "confidence": 0.91, "importance": 2.4}]
    request = requests[-1][0]
    assert request.get_header("Authorization") == "Bearer " + "t" * 32
    assert json.loads(request.data)["model"] == "jev-latest"
    client.disconnect()
    assert not client.configured()


def test_smart_moments_adds_confident_bookmarks_without_duplicates(tmp_path):
    class FakeJev:
        def configured(self):
            return True

        def classify(self, segments, template):
            return [{"at": segments[0]["start"], "kind": "Action", "confidence": 0.93, "importance": 2.2}]

    store = Store(tmp_path)
    store.update_settings({"smart_moments": True})
    smart = SmartMoments(store, FakeJev())
    smart.start()
    segment = {"start": 8.0, "text": "Bernard will send the proposal."}
    smart.submit_live("recording-id", "general", segment)
    smart.submit_live("recording-id", "general", segment)

    bookmark = None
    for _ in range(50):
        with store.connect() as db:
            rows = db.execute("SELECT * FROM bookmarks").fetchall()
        if rows:
            bookmark = dict(rows[0])
            if smart.pending.unfinished_tasks == 0:
                break
        time.sleep(0.02)
    smart.close()

    assert len(rows) == 1
    assert bookmark["kind"] == "Action"
    assert bookmark["source"] == "jev"
    assert bookmark["confidence"] == 0.93


def test_jev_connection_enables_and_disconnect_disables_smart_moments(tmp_path):
    class FakeJev:
        connected = False

        def configured(self):
            return self.connected

        def connect(self, key):
            assert key == "j" * 32
            self.connected = True

        def disconnect(self):
            self.connected = False

    provider = FakeJev()
    app = create_app(tmp_path, worker=False, jev=provider)
    with TestClient(app, headers={"X-Studio-Request": "1"}) as client:
        connected = client.post("/api/providers/jev", json={"api_key": "j" * 32})
        assert connected.json() == {"configured": True, "enabled": True}
        assert client.get("/api/settings").json()["smart_moments"] is True
        assert client.get("/api/environment").json()["jev"]["enabled"] is True

        disconnected = client.request("DELETE", "/api/providers/jev", json={"confirm": True})
        assert disconnected.json() == {"configured": False, "enabled": False}
        assert client.get("/api/settings").json()["smart_moments"] is False


def test_jev_timeout_and_invalid_payload_are_actionable(tmp_path):
    import pytest
    from studio.jev import JevError

    def timeout(*args, **kwargs):
        raise TimeoutError()

    with pytest.raises(JevError, match="could not be reached"):
        Jev(tmp_path, opener=timeout).connect("t" * 32)
    with pytest.raises(JevError, match="invalid response"):
        Jev(tmp_path, opener=lambda *args, **kwargs: Response(b'[]')).connect("t" * 32)
    assert not (tmp_path / '.typesafe-key').exists()


def test_worker_reports_errors_and_recovers(tmp_path):
    from studio.jev import JevError

    class Provider:
        calls = 0
        def configured(self):
            return True
        def classify(self, *args):
            self.calls += 1
            if self.calls == 1:
                raise JevError('TypeSafe could not be reached.')
            return []

    store = Store(tmp_path)
    store.update_settings({'smart_moments': True})
    smart = SmartMoments(store, Provider())
    smart.start()
    try:
        smart.submit_live('sample', 'general', {'text': 'Test', 'start': 0})
        smart.pending.join()
        assert smart.last_error == 'TypeSafe could not be reached.'
        smart.submit_live('sample', 'general', {'text': 'Test', 'start': 0})
        smart.pending.join()
        assert smart.last_error is None
    finally:
        smart.close()
