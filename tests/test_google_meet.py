import io
import json
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from studio.app import create_app
from studio.google_meet import GoogleMeet, assign_speakers


class Response(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def stamp(seconds):
    return datetime.fromtimestamp(1_700_000_000 + seconds, timezone.utc).isoformat().replace("+00:00", "Z")


def test_google_transcript_entries_name_local_segments():
    segments = [
        {"start": 2, "end": 5, "text": "Welcome"},
        {"start": 6, "end": 9, "text": "Thank you"},
    ]
    entries = [
        {"startTime": stamp(1), "endTime": stamp(5), "participant": "participants/alex"},
        {"startTime": stamp(6), "endTime": stamp(10), "participant": "participants/sam"},
    ]

    count = assign_speakers(
        segments,
        entries,
        {"participants/alex": "Alex Morgan", "participants/sam": "Sam Lee"},
        1_700_000_000,
    )

    assert count == 2
    assert [(item["speaker"], item["speaker_name"]) for item in segments] == [
        (0, "Alex Morgan"),
        (1, "Sam Lee"),
    ]


def test_google_oauth_uses_pkce_and_stores_private_refresh_token(tmp_path):
    captured = []

    def opener(request, timeout):
        captured.append(request)
        return Response(
            json.dumps({"access_token": "access", "refresh_token": "refresh", "expires_in": 3600}).encode()
        )

    google = GoogleMeet(tmp_path, opener=opener)
    authorization = google.begin(
        "123456789.apps.googleusercontent.com",
        "desktop-client-secret",
        "http://127.0.0.1:54321/api/providers/google-meet/callback",
    )
    state = google.pending["state"]

    assert "code_challenge_method=S256" in authorization
    assert "meetings.space.readonly" in authorization
    google.complete(state, "authorization-code")

    assert google.configured()
    assert google.path.stat().st_mode & 0o777 == 0o600
    assert b"code_verifier=" in captured[0].data
    assert b"client_secret=desktop-client-secret" in captured[0].data


class FakeGoogleMeet:
    def __init__(self):
        self.connected = False
        self.disconnected = False

    def configured(self):
        return self.connected

    def begin(self, client_id, client_secret, redirect_uri):
        assert client_id == "123456789.apps.googleusercontent.com"
        assert client_secret == "desktop-client-secret"
        assert redirect_uri.endswith("/api/providers/google-meet/callback")
        return "https://accounts.google.com/o/oauth2/v2/auth?state=test"

    def complete(self, state, code):
        assert (state, code) == ("test-state", "test-code")
        self.connected = True

    def disconnect(self):
        self.connected = False
        self.disconnected = True

    def sync(self, store, identifier):
        store.job(identifier)
        return {"status": "matched", "renamed": 2, "message": "Named 2 transcript sections from Google Meet."}


def test_google_meet_connection_routes(tmp_path):
    provider = FakeGoogleMeet()
    app = create_app(tmp_path, worker=False, google_meet=provider)

    with TestClient(app, base_url="http://127.0.0.1") as client:
        assert client.get("/api/environment").json()["google_meet"]["configured"] is False
        response = client.post(
            "/api/providers/google-meet/start",
            json={
                "client_id": "123456789.apps.googleusercontent.com",
                "client_secret": "desktop-client-secret",
            },
            headers={"X-Studio-Request": "1"},
        )
        assert response.status_code == 200
        assert response.json()["authorization_url"].startswith("https://accounts.google.com/")

        callback = client.get("/api/providers/google-meet/callback?state=test-state&code=test-code")
        assert callback.status_code == 200
        assert provider.connected

        response = client.request(
            "DELETE",
            "/api/providers/google-meet",
            json={"confirm": True},
            headers={"X-Studio-Request": "1"},
        )
        assert response.status_code == 200
        assert provider.disconnected


def test_callback_error_pages_do_not_expose_provider_input(tmp_path):
    from studio.google_meet import GoogleMeetError

    class FailedGoogleMeet(FakeGoogleMeet):
        def complete(self, state, code):
            raise GoogleMeetError("private provider detail")

    app = create_app(tmp_path, worker=False, google_meet=FailedGoogleMeet())
    with TestClient(app, base_url="http://127.0.0.1") as client:
        cancelled = client.get("/api/providers/google-meet/callback?error=access_denied")
        assert cancelled.status_code == 400
        assert "Maybe next time." in cancelled.text
        failed = client.get("/api/providers/google-meet/callback?state=expired&code=secret")
        assert failed.status_code == 400
        assert "Let's try that again." in failed.text
        assert "private provider detail" not in failed.text
        assert "secret" not in failed.text
        assert 'href="/static/connection.css"' in failed.text
        css = client.get("/static/connection.css")
        assert css.status_code == 200
        assert "prefers-reduced-motion" in css.text
