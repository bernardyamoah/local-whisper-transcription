"""The sole owner of durable job states and the single inference worker."""

import json
import logging
import math
import os
import signal
import subprocess
import sys
import threading
import time
import uuid

TRANSITIONS = {
    "queued": {"preparing", "cancelled"},
    "preparing": {"transcribing", "cancelling", "failed", "interrupted"},
    "transcribing": {"saving", "cancelling", "failed", "interrupted"},
    "saving": {"completed", "cancelling", "failed", "interrupted"},
    "cancelling": {"cancelled", "interrupted", "failed"},
    "failed": {"queued"},
    "cancelled": {"queued"},
    "interrupted": {"queued"},
    "completed": {"queued"},
}
ACTIVE = {"preparing", "transcribing", "saving", "cancelling"}


class Orchestrator:
    def __init__(self, store, command=None, model_path=None):
        self.store = store
        self.command = command or [sys.executable, "-m", "studio.engine"]
        self.model_path = model_path or (lambda model: self.store.path("models", model))
        self.lock = threading.RLock()
        self.stop = threading.Event()
        self.thread = None

    def transition(self, db, identifier, state, **fields):
        current = db.execute("SELECT state FROM jobs WHERE id=?", (identifier,)).fetchone()
        if not current or state not in TRANSITIONS[current[0]]:
            raise ValueError(f"Cannot move job to {state}")
        values = {"state": state, "stage": state, "updated": time.time()} | fields
        db.execute(
            "UPDATE jobs SET " + ",".join(f"{key}=?" for key in values) + " WHERE id=?",
            (*values.values(), identifier),
        )
        db.execute("INSERT INTO transitions(job_id,state,at) VALUES(?,?,?)", (identifier, state, time.time()))

    def recover(self):
        with self.lock, self.store.connect() as db:
            for row in db.execute("SELECT id,state FROM jobs").fetchall():
                if row["state"] in ACTIVE:
                    self.transition(
                        db,
                        row["id"],
                        "interrupted",
                        error="The application stopped during processing. Retry to continue.",
                    )
        for path in (self.store.root / "temporary").iterdir():
            if path.is_file():
                path.unlink(missing_ok=True)

    def start(self):
        self.recover()
        self.thread = threading.Thread(target=self.run, daemon=True, name="transcription-worker")
        self.thread.start()

    def close(self):
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=15)

    def create(self, media_id, title, language, preset, model):
        with self.lock, self.store.connect() as db:
            media = db.execute("SELECT * FROM media WHERE id=?", (media_id,)).fetchone()
            if not media or not self.store.path("sources", media_id).exists():
                raise ValueError("The original recording is unavailable. Import it again.")
            if db.execute("SELECT 1 FROM jobs WHERE media_id=?", (media_id,)).fetchone():
                raise ValueError("This recording already has a job. Open it or retry it from your library.")
            identifier, now = uuid.uuid4().hex, time.time()
            db.execute(
                """INSERT INTO jobs(id,media_id,title,state,stage,language,preset,model,created,updated)
                       VALUES(?,?,?,'queued','queued',?,?,?,?,?)""",
                (identifier, media_id, title or media["name"], language, preset, model, now, now),
            )
            db.execute("INSERT INTO transitions(job_id,state,at) VALUES(?,?,?)", (identifier, "queued", now))
        return self.store.job(identifier)

    def cancel(self, identifier):
        with self.lock, self.store.connect() as db:
            job = self.store.job(identifier)
            self.transition(db, identifier, "cancelled" if job["state"] == "queued" else "cancelling")
        return self.store.job(identifier)

    def retry(self, identifier):
        with self.lock, self.store.connect() as db:
            job = self.store.job(identifier)
            if not job["source_available"]:
                raise ValueError("The source recording is missing. Import it again.")
            if (
                job["state"] == "completed"
                and db.execute("SELECT 1 FROM segments WHERE job_id=?", (identifier,)).fetchone()
            ):
                raise ValueError("Only an empty transcript can be retried.")
            self.transition(
                db,
                identifier,
                "queued",
                error=None,
                detected_language=None,
                engine_version=None,
                progress=0,
                started=None,
                finished=None,
                attempt=job["attempt"] + 1,
            )
        return self.store.job(identifier)

    def run(self):
        while not self.stop.is_set():
            with self.lock, self.store.connect() as db:
                row = db.execute(
                    "SELECT id FROM jobs WHERE state='queued' ORDER BY created LIMIT 1"
                ).fetchone()
                if row:
                    self.transition(db, row[0], "preparing", started=time.time(), progress=1)
            if row:
                self.process(row[0])
            else:
                self.stop.wait(0.3)

    @staticmethod
    def terminate(process):
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            except ProcessLookupError:
                pass

    def process(self, identifier):
        job = self.store.job(identifier)
        normalized = self.store.path("temporary", identifier, ".wav")
        output = self.store.path("temporary", identifier, ".json")
        events = self.store.path("temporary", identifier, ".jsonl")
        playback = self.store.path("playback", identifier, ".mp3")
        process = None
        error_message = "Transcription stopped unexpectedly. Check the model and free disk space, then retry."
        try:
            events.write_text("")
            process = subprocess.Popen(
                self.command
                + [
                    str(self.store.path("sources", job["media_id"])),
                    str(normalized),
                    str(playback),
                    str(self.model_path(job["model"])),
                    job["language"],
                    self.store.settings()["hardware"],
                    str(output),
                    str(events),
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
                env=os.environ
                | {"STUDIO_PARENT_PID": str(os.getpid()), "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"},
            )
            with events.open() as event_stream:
                while True:
                    if self.stop.is_set() or self.store.job(identifier)["state"] == "cancelling":
                        self.terminate(process)
                        with self.lock, self.store.connect() as db:
                            self.transition(
                                db, identifier, "interrupted" if self.stop.is_set() else "cancelled"
                            )
                        return
                    exited = process.poll() is not None
                    for line in event_stream:
                        event = json.loads(line)
                        if "error" in event:
                            error_message = event["error"]
                            logging.getLogger("studio").warning(
                                "Engine failure: %s", event.get("category", "resource")
                            )
                            continue
                        with self.lock, self.store.connect() as db:
                            state = self.store.job(identifier)["state"]
                            if state == "cancelling":
                                continue
                            if event["stage"] != state:
                                self.transition(db, identifier, event["stage"])
                            db.execute(
                                "UPDATE jobs SET progress=?, backend=COALESCE(?,backend), updated=? WHERE id=?",
                                (event["progress"], event.get("backend"), time.time(), identifier),
                            )
                    if exited:
                        break
                    self.stop.wait(0.2)
            if process.returncode:
                raise RuntimeError(error_message)
            result = json.loads(output.read_text())
            with self.lock:
                with self.lock, self.store.connect() as db:
                    if self.store.job(identifier)["state"] == "cancelling":
                        self.transition(db, identifier, "cancelled")
                        return
                    for sequence, segment in enumerate(result["segments"]):
                        start, end = float(segment["start"]), float(segment["end"])
                        if not math.isfinite(start) or not math.isfinite(end) or not 0 <= start <= end:
                            raise ValueError("Invalid engine timestamps")
                        db.execute(
                            "INSERT INTO segments(job_id,sequence,start,end,original,text,confidence) VALUES(?,?,?,?,?,?,?)",
                            (
                                identifier,
                                sequence,
                                start,
                                end,
                                segment["text"],
                                segment["text"],
                                segment.get("confidence"),
                            ),
                        )
                    self.transition(
                        db,
                        identifier,
                        "completed",
                        progress=100,
                        finished=time.time(),
                        detected_language=result["language"],
                        engine_version=result["version"],
                    )
                with self.lock:
                    if not self.store.settings()["retain_source"]:
                        try:
                            self.store.path("sources", job["media_id"]).unlink(missing_ok=True)
                            playback.unlink(missing_ok=True)
                            with self.store.connect() as db:
                                db.execute("UPDATE media SET retained=0 WHERE id=?", (job["media_id"],))
                        except OSError:
                            with self.store.connect() as db:
                                db.execute(
                                    "UPDATE jobs SET error=? WHERE id=?",
                                    (
                                        "Transcript saved, but recording cleanup failed. Use Delete to remove retained files.",
                                        identifier,
                                    ),
                                )
        except Exception as error:
            logging.getLogger("studio").warning("Job failure category: %s", type(error).__name__)
            with self.lock, self.store.connect() as db:
                if self.store.job(identifier)["state"] in ACTIVE:
                    self.transition(db, identifier, "failed", error=error_message, finished=time.time())
        finally:
            if process:
                self.terminate(process)
            for path in (normalized, output, events):
                path.unlink(missing_ok=True)
            with self.lock, self.store.connect() as db:
                row = db.execute("SELECT state FROM jobs WHERE id=?", (identifier,)).fetchone()
                if row is None or row[0] != "completed":
                    playback.unlink(missing_ok=True)
