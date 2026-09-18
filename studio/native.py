from __future__ import annotations

import json
import os
import selectors
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path


class NativeBridge:
    def __init__(self, root: Path, command: list[str] | None = None, on_final=None):
        self.root = root
        self.command = command if command is not None else self._find_command()
        self.lock = threading.RLock()
        self.process: subprocess.Popen | None = None
        self.reader: threading.Thread | None = None
        self.recording: dict | None = None
        self._capabilities: dict | None = None
        self.on_final = on_final

    def capabilities(self) -> dict:
        if self._capabilities is not None:
            return self._capabilities
        fallback = {"recording": False, "speech_analyzer": False, "locales": []}
        if not self.command:
            self._capabilities = fallback
            return fallback
        try:
            result = subprocess.run(
                [*self.command, "capabilities"], capture_output=True, text=True, timeout=10, check=True
            )
            self._capabilities = fallback | json.loads(result.stdout.splitlines()[-1])
        except (OSError, subprocess.SubprocessError, ValueError, IndexError):
            self._capabilities = fallback
        return self._capabilities

    def start(self, name: str, language: str = "auto", template: str = "general") -> dict:
        with self.lock:
            if self.process and self.process.poll() is None:
                raise RuntimeError("A meeting recording is already active.")
            if not self.capabilities()["recording"]:
                raise RuntimeError("Meeting recording is unavailable on this Mac.")
            identifier = uuid.uuid4().hex
            path = self.root / "temporary" / f"{identifier}.mp4"
            process = subprocess.Popen(
                [*self.command, "record", str(path), language],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                start_new_session=True,
            )
            try:
                event = self._read_event(process, 60)
            except (RuntimeError, ValueError):
                process.kill()
                process.wait()
                raise
            if event.get("type") != "recording.started":
                process.kill()
                process.wait()
                raise RuntimeError(event.get("message", "Meeting recording could not start."))
            self.process = process
            self.recording = {
                "id": identifier,
                "name": name or "Meeting recording",
                "started": time.time(),
                "state": "recording",
                "path": path,
                "language": language,
                "template": template,
                "live_transcript": [],
                "interim": {},
                "live_error": None,
            }
            self.reader = threading.Thread(
                target=self._consume_events,
                args=(self.recording, process),
                daemon=True,
                name="meeting-live-transcript",
            )
            self.reader.start()
            return self.status()

    def status(self) -> dict:
        if not self.recording:
            return {"state": "idle"}
        state = self.recording["state"]
        if self.process and self.process.poll() is not None and state == "recording":
            state = "failed"
        live = list(self.recording["live_transcript"])
        live.extend(self.recording["interim"].values())
        live.sort(key=lambda item: (item.get("start", 0), item.get("source", "")))
        return {
            "id": self.recording["id"],
            "name": self.recording["name"],
            "started": self.recording["started"],
            "elapsed": max(0, time.time() - self.recording["started"]),
            "state": state,
            "template": self.recording["template"],
            "live_transcript": live,
            "live_error": self.recording["live_error"],
        }

    def stop(self) -> dict:
        with self.lock:
            if not self.process or not self.recording:
                raise RuntimeError("No meeting recording is active.")
            if self.process.poll() is None:
                os.killpg(self.process.pid, signal.SIGINT)
            try:
                self.process.wait(timeout=120)
            except subprocess.TimeoutExpired as timeout:
                os.killpg(self.process.pid, signal.SIGTERM)
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                self.recording["state"] = "failed"
                raise RuntimeError("Meeting recording did not stop cleanly.") from timeout
            if self.reader:
                self.reader.join(timeout=3)
            error = self.process.stderr.read()
            if self.process.returncode != 0:
                self.recording["state"] = "failed"
                raise RuntimeError(self._error_message(error))
            self.recording["state"] = "stopped"
            result = self.recording.copy()
            self.process = None
            self.reader = None
            self.recording = None
            return result

    def close(self) -> None:
        with self.lock:
            if not self.process or self.process.poll() is not None:
                return
            os.killpg(self.process.pid, signal.SIGTERM)
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()

    def _consume_events(self, recording: dict, process: subprocess.Popen) -> None:
        for line in process.stdout:
            try:
                event = json.loads(line)
            except (json.JSONDecodeError, TypeError):
                continue
            event_type = event.get("type")
            if event_type not in {"transcript.final", "transcript.interim"}:
                if event_type == "transcript.unavailable":
                    recording["live_error"] = event.get("message")
                continue
            source = event.get("source", "Meeting")
            item = {
                "source": source,
                "start": max(0, float(event.get("start", 0))),
                "end": max(0, float(event.get("end", 0))),
                "text": str(event.get("text", "")).strip(),
                "final": event_type == "transcript.final",
            }
            if not item["text"]:
                continue
            if item["final"]:
                recording["interim"].pop(source, None)
                recording["live_transcript"].append(item)
                if self.on_final:
                    self.on_final(recording["id"], recording["template"], item)
            else:
                recording["interim"][source] = item

    @staticmethod
    def _read_event(process: subprocess.Popen, timeout: float) -> dict:
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        if not selector.select(timeout):
            raise RuntimeError("Meeting recording permission timed out.")
        line = process.stdout.readline()
        if line:
            return json.loads(line)
        return {"type": "error", "message": NativeBridge._error_message(process.stderr.read())}

    @staticmethod
    def _error_message(value: str) -> str:
        try:
            return json.loads(value.splitlines()[-1])["message"]
        except (json.JSONDecodeError, IndexError, KeyError):
            return value.strip() or "The native audio service stopped unexpectedly."

    @staticmethod
    def _find_command() -> list[str]:
        executable = shutil.which("whisper-studio-audio-bridge")
        if executable:
            return [executable]
        if sys.platform == "darwin":
            development = (
                Path(__file__).resolve().parent.parent / "native/.build/release/whisper-studio-audio-bridge"
            )
            if development.is_file():
                return [str(development)]
        return []
