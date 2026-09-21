from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly"


class GoogleMeetError(RuntimeError):
    pass


def _timestamp(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def _rfc3339(value: float) -> str:
    return (
        datetime.fromtimestamp(value, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    )


def assign_speakers(segments: list[dict], entries: list[dict], participants: dict[str, str], started: float):
    identities: dict[str, int] = {}
    assigned = 0
    for segment in segments:
        segment_start = started + float(segment["start"])
        segment_end = started + float(segment["end"])
        best = None
        best_score = 0.0
        for entry in entries:
            entry_start = _timestamp(entry["startTime"])
            entry_end = _timestamp(entry["endTime"])
            overlap = max(0.0, min(segment_end, entry_end) - max(segment_start, entry_start))
            if overlap > best_score:
                best, best_score = entry, overlap
        if best is None:
            midpoint = (segment_start + segment_end) / 2
            nearby = sorted(
                entries,
                key=lambda entry: abs(
                    ((_timestamp(entry["startTime"]) + _timestamp(entry["endTime"])) / 2) - midpoint
                ),
            )
            if nearby:
                distance = abs(
                    ((_timestamp(nearby[0]["startTime"]) + _timestamp(nearby[0]["endTime"])) / 2) - midpoint
                )
                if distance <= 3:
                    best = nearby[0]
        if best is None:
            continue
        participant = best.get("participant", "")
        name = participants.get(participant)
        if not participant or not name:
            continue
        speaker = identities.setdefault(participant, len(identities))
        segment["speaker"] = speaker
        segment["speaker_name"] = name
        assigned += 1
    return assigned


class GoogleMeet:
    def __init__(self, root: Path, opener=urlopen):
        self.path = Path(root) / ".google-meet.json"
        self.opener = opener
        self.pending: dict[str, str] | None = None
        self.lock = threading.RLock()

    def configured(self) -> bool:
        value = self._load()
        return bool(value.get("client_id") and value.get("client_secret") and value.get("refresh_token"))

    def begin(self, client_id: str, client_secret: str, redirect_uri: str) -> str:
        client_id = client_id.strip()
        client_secret = client_secret.strip()
        if not client_id.endswith(".apps.googleusercontent.com") or len(client_id) > 300:
            raise GoogleMeetError("Enter a Google OAuth desktop client ID.")
        if not client_secret or len(client_secret) > 300:
            raise GoogleMeetError("The Google OAuth desktop client is incomplete.")
        verifier = secrets.token_urlsafe(64)[:96]
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        state = secrets.token_urlsafe(32)
        with self.lock:
            self.pending = {
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "verifier": verifier,
                "state": state,
            }
        parameters = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": SCOPE,
            "access_type": "offline",
            "prompt": "consent",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": state,
        }
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(parameters)

    def complete(self, state: str, code: str) -> None:
        with self.lock:
            pending = self.pending
            self.pending = None
        if not pending or not secrets.compare_digest(state, pending["state"]):
            raise GoogleMeetError("This Google connection request expired. Start again.")
        payload = urlencode(
            {
                "client_id": pending["client_id"],
                "client_secret": pending["client_secret"],
                "code": code,
                "code_verifier": pending["verifier"],
                "grant_type": "authorization_code",
                "redirect_uri": pending["redirect_uri"],
            }
        ).encode()
        token = self._open_json(
            Request(
                "https://oauth2.googleapis.com/token",
                data=payload,
                method="POST",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        )
        refresh_token = token.get("refresh_token")
        if not refresh_token:
            raise GoogleMeetError("Google did not return long-term access. Remove access and reconnect.")
        self._save(
            {
                "client_id": pending["client_id"],
                "client_secret": pending["client_secret"],
                "access_token": token["access_token"],
                "refresh_token": refresh_token,
                "expires_at": time.time() + int(token.get("expires_in", 3600)) - 60,
            }
        )

    def disconnect(self) -> None:
        token = self._load().get("refresh_token")
        if token:
            try:
                self.opener(
                    Request(
                        "https://oauth2.googleapis.com/revoke",
                        data=urlencode({"token": token}).encode(),
                        method="POST",
                        headers={"Content-Type": "application/x-www-form-urlencoded"},
                    ),
                    timeout=20,
                )
            except (HTTPError, URLError, OSError):
                pass
        self.path.unlink(missing_ok=True)

    def sync(self, store, identifier: str) -> dict:
        if not self.configured():
            raise GoogleMeetError("Connect Google Meet before identifying speakers.")
        job = store.job(identifier)
        if not job.get("started") or not job.get("finished"):
            raise GoogleMeetError("This recording has no meeting time information.")
        conference = self._matching_conference(job["started"], job["finished"])
        if conference is None:
            return {
                "status": "pending",
                "renamed": 0,
                "message": "No matching Google Meet call was found yet.",
            }
        transcripts = self._list(f"{conference['name']}/transcripts", "transcripts")
        if not transcripts:
            return {
                "status": "pending",
                "renamed": 0,
                "message": "Google Meet’s transcript is not ready yet.",
            }
        entries = self._list(f"{transcripts[-1]['name']}/entries", "transcriptEntries")
        people = self._list(f"{conference['name']}/participants", "participants")
        names = {}
        for person in people:
            user = person.get("signedinUser") or person.get("anonymousUser") or person.get("phoneUser") or {}
            if user.get("displayName"):
                names[person["name"]] = user["displayName"]
        with store.connect() as db:
            segments = [
                dict(row) for row in db.execute("SELECT * FROM segments WHERE job_id=?", (identifier,))
            ]
            renamed = assign_speakers(segments, entries, names, job["started"])
            for segment in segments:
                if segment.get("speaker_name"):
                    db.execute(
                        "UPDATE segments SET speaker=?, speaker_name=? WHERE id=? AND job_id=?",
                        (segment["speaker"], segment["speaker_name"], segment["id"], identifier),
                    )
            if renamed:
                db.execute(
                    "UPDATE jobs SET revision=revision+1, updated=? WHERE id=?",
                    (time.time(), identifier),
                )
        return {
            "status": "matched" if renamed else "pending",
            "renamed": renamed,
            "message": f"Named {renamed} transcript sections from Google Meet."
            if renamed
            else "No speaker timings matched yet.",
        }

    def sync_later(self, store, identifier: str) -> None:
        def work():
            for delay in (15, 60, 180, 600):
                time.sleep(delay)
                try:
                    if self.sync(store, identifier)["status"] == "matched":
                        return
                except GoogleMeetError:
                    return
                except (HTTPError, URLError, OSError, ValueError):
                    continue

        threading.Thread(target=work, daemon=True, name="google-meet-speaker-sync").start()

    def _matching_conference(self, started: float, finished: float):
        query = urlencode(
            {
                "pageSize": 100,
                "filter": (
                    f'start_time>="{_rfc3339(started - 3600)}" AND start_time<="{_rfc3339(finished + 3600)}"'
                ),
            }
        )
        records = self._get_json("conferenceRecords?" + query).get("conferenceRecords", [])
        ranked = []
        for record in records:
            record_start = _timestamp(record["startTime"])
            record_end = _timestamp(record.get("endTime") or _rfc3339(finished))
            overlap = max(0.0, min(finished, record_end) - max(started, record_start))
            if overlap:
                ranked.append((overlap, record))
        return max(ranked, key=lambda item: item[0])[1] if ranked else None

    def _list(self, path: str, field: str) -> list[dict]:
        values = []
        token = None
        while True:
            separator = "&" if "?" in path else "?"
            page = self._get_json(
                path
                + (
                    separator + urlencode({"pageSize": 100, "pageToken": token})
                    if token
                    else separator + "pageSize=100"
                )
            )
            values.extend(page.get(field, []))
            token = page.get("nextPageToken")
            if not token:
                return values

    def _get_json(self, path: str) -> dict:
        token = self._access_token()
        request = Request(
            "https://meet.googleapis.com/v2/" + path,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        return self._open_json(request)

    def _access_token(self) -> str:
        value = self._load()
        if value.get("access_token") and float(value.get("expires_at", 0)) > time.time():
            return value["access_token"]
        payload = urlencode(
            {
                "client_id": value.get("client_id", ""),
                "client_secret": value.get("client_secret", ""),
                "refresh_token": value.get("refresh_token", ""),
                "grant_type": "refresh_token",
            }
        ).encode()
        token = self._open_json(
            Request(
                "https://oauth2.googleapis.com/token",
                data=payload,
                method="POST",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        )
        value["access_token"] = token["access_token"]
        value["expires_at"] = time.time() + int(token.get("expires_in", 3600)) - 60
        self._save(value)
        return value["access_token"]

    def _open_json(self, request: Request) -> dict:
        try:
            with self.opener(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as error:
            detail = "Google Meet rejected the request."
            try:
                payload = json.loads(error.read())
                detail = payload.get("error_description") or payload.get("error", {}).get("message") or detail
            except (json.JSONDecodeError, AttributeError):
                pass
            raise GoogleMeetError(detail) from error
        except URLError as error:
            raise GoogleMeetError("Google Meet could not be reached.") from error

    def _load(self) -> dict:
        try:
            return json.loads(self.path.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def _save(self, value: dict) -> None:
        temporary = self.path.with_suffix(".part")
        temporary.write_text(json.dumps(value))
        os.chmod(temporary, 0o600)
        temporary.replace(self.path)
