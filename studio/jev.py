from __future__ import annotations

import json
import logging
import os
import queue
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from studio.templates import MEETING_TEMPLATES


class JevError(RuntimeError):
    pass


class Jev:
    endpoint = "https://api.typesafe.ai/v1/systemone"

    def __init__(self, root: Path, opener=urlopen):
        self.path = Path(root) / ".typesafe-key"
        self.opener = opener

    def configured(self) -> bool:
        return bool(self.key())

    def key(self) -> str:
        environment = os.getenv("TYPESAFE_API_KEY", "").strip()
        if environment:
            return environment
        try:
            return self.path.read_text().strip()
        except FileNotFoundError:
            return ""

    def connect(self, key: str) -> None:
        key = key.strip()
        if len(key) < 20:
            raise JevError("Enter a valid TypeSafe API key.")
        self._request(
            key,
            "Connection check.",
            {
                "reachable": {
                    "type": "noul",
                    "instructions": "Is `state` a connection check?",
                }
            },
        )
        self.path.write_text(key)
        self.path.chmod(0o600)

    def disconnect(self) -> None:
        self.path.unlink(missing_ok=True)

    def classify(self, segments: list[dict], template: str) -> list[dict]:
        if not segments:
            return []
        kinds = MEETING_TEMPLATES[template]["bookmarks"]
        criteria = {f"kind_{index}": kind for index, kind in enumerate(kinds)} | {
            "none": "Routine conversation that should not be bookmarked."
        }
        questions = {}
        for index in range(len(segments)):
            questions[f"kind_{index}"] = {
                "type": "choice",
                "instructions": f"Which meeting moment best describes `segments[{index}].text`?",
                "criteria": criteria,
            }
            questions[f"importance_{index}"] = {
                "type": "score",
                "instructions": f"How important is `segments[{index}].text` to the meeting outcome?",
                "criteria": [
                    "Routine conversation with no lasting value.",
                    "Useful context but not essential.",
                    "Important to remember or act on.",
                    "Critical to the outcome of the meeting.",
                ],
            }
        state = {
            "meeting_type": MEETING_TEMPLATES[template]["name"],
            "segments": [
                {
                    "speaker": item.get("source") or item.get("speaker_name") or "Speaker",
                    "text": str(item.get("text", ""))[:4000],
                }
                for item in segments
            ],
        }
        payload = self._request(self.key(), state, questions)
        answers = payload.get("answers", {})
        results = []
        for index, segment in enumerate(segments):
            choice = answers.get(f"kind_{index}", {})
            importance = answers.get(f"importance_{index}", {})
            selected = str(choice.get("choice", "none"))
            try:
                kind = kinds[int(selected.removeprefix("kind_"))] if selected.startswith("kind_") else None
            except (ValueError, IndexError):
                kind = None
            results.append(
                {
                    "at": float(segment.get("start", 0)),
                    "kind": kind,
                    "confidence": float(choice.get("confidence", 0)),
                    "importance": float(importance.get("score", 0)),
                }
            )
        return results

    def _request(self, key: str, state, questions: dict) -> dict:
        if not key:
            raise JevError("Connect TypeSafe in Settings first.")
        request = Request(
            self.endpoint,
            data=json.dumps({"state": state, "model": "jev-latest", "questions": questions}).encode(),
            method="POST",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
        )
        try:
            with self.opener(request, timeout=30) as response:
                payload = json.load(response)
                if not isinstance(payload, dict) or not isinstance(payload.get("answers"), dict):
                    raise JevError("TypeSafe returned an invalid response. Try again.")
                return payload
        except HTTPError as error:
            message = "TypeSafe rejected this request."
            try:
                detail = json.loads(error.read()).get("detail")
                if detail:
                    message = str(detail)
            except (json.JSONDecodeError, AttributeError):
                pass
            raise JevError(message) from error
        except (URLError, TimeoutError) as error:
            raise JevError("TypeSafe could not be reached. Check your connection and try again.") from error
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise JevError("TypeSafe returned an invalid response. Try again.") from error


class SmartMoments:
    confidence_threshold = 0.7
    importance_threshold = 1.4

    def __init__(self, store, jev: Jev):
        self.store = store
        self.jev = jev
        self.pending: queue.Queue[tuple] = queue.Queue(maxsize=500)
        self.stop = threading.Event()
        self.thread: threading.Thread | None = None
        self.last_error: str | None = None
        self.analysis: dict[str, dict] = {}
        self.analysis_lock = threading.Lock()

    def analysis_status(self, job_id: str) -> dict:
        with self.analysis_lock:
            return dict(self.analysis.get(job_id, {"state": "idle", "error": None}))

    def rescan(self, job_id: str, summary: bool = False) -> dict:
        job = self.store.job(job_id)
        if job["state"] != "completed":
            raise JevError("Finish transcription before analyzing this meeting.")
        if not self.jev.configured():
            raise JevError("Connect JEV in Settings to analyze this meeting.")
        with self.analysis_lock:
            current = self.analysis.get(job_id, {})
            if current.get("state") in {"queued", "running"}:
                return dict(current)
            status = {"state": "queued", "error": None}
            try:
                self.pending.put_nowait(("rescan", job_id, summary))
            except queue.Full as error:
                raise JevError("Analysis is busy. Try again shortly.") from error
            self.analysis[job_id] = status
            return dict(status)

    def _rescan(self, job_id: str, summary: bool) -> None:
        with self.analysis_lock:
            self.analysis[job_id] = {"state": "running", "error": None}
        job = self.store.job(job_id)
        with self.store.connect() as db:
            segments = [dict(row) for row in db.execute(
                "SELECT start,text,speaker_name FROM segments WHERE job_id=? ORDER BY sequence", (job_id,)
            )]
        if not segments:
            raise JevError("This transcript has no text to analyze.")
        selected = []
        for start in range(0, len(segments), 20):
            batch = segments[start:start + 20]
            decisions = self.jev.classify(batch, job["template"])
            for segment, decision in zip(batch, decisions):
                if decision["kind"] and decision["confidence"] >= self.confidence_threshold and decision["importance"] >= self.importance_threshold:
                    selected.append((segment, decision))
        # Commit only after all requests succeed; failures preserve previous results.
        with self.store.connect() as db:
            db.execute("DELETE FROM bookmarks WHERE media_id=? AND source='jev'", (job["media_id"],))
            for segment, decision in selected:
                duplicate = db.execute(
                    "SELECT 1 FROM bookmarks WHERE media_id=? AND kind=? AND ABS(at-?) < 4",
                    (job["media_id"], decision["kind"], decision["at"]),
                ).fetchone()
                if not duplicate:
                    db.execute("INSERT INTO bookmarks(id,media_id,at,kind,note,created,source,confidence) VALUES(?,?,?,?,?,?,?,?)",
                               (uuid.uuid4().hex, job["media_id"], decision["at"], decision["kind"], segment["text"], time.time(), "jev", decision["confidence"]))
            if summary:
                highlights = sorted(sorted(selected, key=lambda item: item[1]["importance"], reverse=True)[:8], key=lambda item: item[0]["start"])
                summary_text = "\n\n".join(segment["text"] for segment, _ in highlights) or "No significant meeting highlights were identified."
                chapters = [{"start": segment["start"], "title": segment["text"]} for segment, _ in highlights]
                db.execute("INSERT OR REPLACE INTO meeting_notes(job_id,summary,chapters,topics) VALUES(?,?,?,?)",
                           (job_id, summary_text, json.dumps(chapters), json.dumps(list(dict.fromkeys(d["kind"] for _, d in highlights)))))
        with self.analysis_lock:
            self.analysis[job_id] = {"state": "completed", "error": None}

    def start(self) -> None:
        self.thread = threading.Thread(target=self._run, daemon=True, name="smart-moments")
        self.thread.start()

    def close(self) -> None:
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=5)

    def submit_live(self, media_id: str, template: str, segment: dict) -> None:
        if self._enabled():
            self._submit(("segments", media_id, template, [segment]))

    def submit_job(self, job_id: str) -> None:
        if self._enabled():
            self._submit(("job", job_id))

    def _enabled(self) -> bool:
        return self.jev.configured() and bool(self.store.settings().get("smart_moments"))

    def _submit(self, item: tuple) -> None:
        try:
            self.pending.put_nowait(item)
        except queue.Full:
            pass

    def _run(self) -> None:
        while not self.stop.is_set():
            try:
                task = self.pending.get(timeout=0.25)
            except queue.Empty:
                continue
            try:
                if task[0] == "rescan":
                    self._rescan(task[1], task[2])
                elif task[0] == "job":
                    self._process_job(task[1])
                else:
                    self._process_segments(task[1], task[2], task[3])
                self.last_error = None
            except (JevError, OSError, ValueError, TypeError, KeyError, AttributeError, sqlite3.Error) as error:
                self.last_error = str(error) if isinstance(error, JevError) else "Smart Moments processing failed."
                if task[0] == "rescan":
                    with self.analysis_lock:
                        self.analysis[task[1]] = {"state": "failed", "error": self.last_error}
                logging.getLogger("studio").warning("Smart Moments failed: %s", type(error).__name__)
            finally:
                self.pending.task_done()

    def _process_job(self, job_id: str) -> None:
        job = self.store.job(job_id)
        with self.store.connect() as db:
            segments = [
                dict(row)
                for row in db.execute(
                    "SELECT start,text,speaker_name FROM segments WHERE job_id=? ORDER BY sequence",
                    (job_id,),
                )
            ]
        for start in range(0, len(segments), 20):
            if self.stop.is_set() or not self._enabled():
                return
            self._process_segments(job["media_id"], job["template"], segments[start : start + 20])

    def _process_segments(self, media_id: str, template: str, segments: list[dict]) -> None:
        decisions = self.jev.classify(segments, template)
        with self.store.connect() as db:
            for decision in decisions:
                if (
                    not decision["kind"]
                    or decision["confidence"] < self.confidence_threshold
                    or decision["importance"] < self.importance_threshold
                ):
                    continue
                duplicate = db.execute(
                    "SELECT 1 FROM bookmarks WHERE media_id=? AND kind=? AND ABS(at-?) < 4 LIMIT 1",
                    (media_id, decision["kind"], decision["at"]),
                ).fetchone()
                if duplicate:
                    continue
                db.execute(
                    """INSERT INTO bookmarks(
                         id,media_id,at,kind,note,created,source,confidence
                       ) VALUES(?,?,?,?,?,?,?,?)""",
                    (
                        uuid.uuid4().hex,
                        media_id,
                        decision["at"],
                        decision["kind"],
                        "",
                        time.time(),
                        "jev",
                        decision["confidence"],
                    ),
                )
