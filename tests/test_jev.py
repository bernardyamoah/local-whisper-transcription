import io
import json
import time

from fastapi.testclient import TestClient

from studio.app import create_app
from studio.jev import Jev, SmartMoments
from studio.store import Store


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
