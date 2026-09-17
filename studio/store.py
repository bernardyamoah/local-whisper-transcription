"""SQLite transactions and application-owned paths. No client-supplied file paths."""

import json
import os
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

DEFAULTS = {
    "language": "auto",
    "preset": "balanced",
    "retain_source": True,
    "max_duration_hours": 4,
    "hardware": "auto",
}


class Store:
    def __init__(self, root):
        self.root = Path(root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        for name in ("sources", "temporary", "playback", "models", "logs"):
            (self.root / name).mkdir(exist_ok=True, mode=0o700)
        with self.connect() as db:
            db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS media (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL,
              duration REAL NOT NULL, container TEXT, codec TEXT, checksum TEXT,
              created REAL NOT NULL, retained INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE IF NOT EXISTS jobs (
              id TEXT PRIMARY KEY, media_id TEXT NOT NULL REFERENCES media(id),
              title TEXT NOT NULL, state TEXT NOT NULL, stage TEXT NOT NULL,
              language TEXT NOT NULL, detected_language TEXT, preset TEXT NOT NULL,
              model TEXT NOT NULL, backend TEXT, progress REAL NOT NULL DEFAULT 0,
              created REAL NOT NULL, updated REAL NOT NULL, started REAL, finished REAL,
              error TEXT, attempt INTEGER NOT NULL DEFAULT 1, revision INTEGER NOT NULL DEFAULT 0,
              engine_version TEXT);
            CREATE TABLE IF NOT EXISTS segments (
              id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
              sequence INTEGER NOT NULL, start REAL NOT NULL, end REAL NOT NULL,
              original TEXT NOT NULL, text TEXT NOT NULL, confidence REAL);
            CREATE INDEX IF NOT EXISTS segments_job ON segments(job_id, sequence);
            CREATE TABLE IF NOT EXISTS transitions (
              id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
              state TEXT NOT NULL, at REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated REAL);
            PRAGMA user_version=1;
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.root / "studio.sqlite3", timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def path(self, folder, identifier, suffix=""):
        if folder not in {"sources", "temporary", "playback", "models", "logs"}:
            raise ValueError("Unknown storage area")
        if not identifier or any(
            c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in identifier
        ):
            raise ValueError("Invalid storage identifier")
        if suffix not in {"", ".wav", ".mp3", ".json", ".jsonl", ".part"}:
            raise ValueError("Invalid storage suffix")
        path = self.root / folder / (identifier + suffix)
        if not path.resolve().is_relative_to((self.root / folder).resolve()):
            raise ValueError("Path escapes storage")
        return path

    def settings(self):
        with self.connect() as db:
            return DEFAULTS | {r["key"]: json.loads(r["value"]) for r in db.execute("SELECT * FROM settings")}

    def update_settings(self, settings):
        with self.connect() as db:
            db.executemany(
                "INSERT OR REPLACE INTO settings VALUES (?,?,?)",
                [(k, json.dumps(v), time.time()) for k, v in settings.items()],
            )
        return self.settings()

    def job(self, identifier):
        with self.connect() as db:
            row = db.execute(
                """SELECT j.*, m.name AS filename, m.duration, m.size, m.retained
                FROM jobs j JOIN media m ON m.id=j.media_id WHERE j.id=?""",
                (identifier,),
            ).fetchone()
            if row is None:
                raise KeyError(identifier)
            result = dict(row)
            result["source_available"] = self.path("sources", result["media_id"]).exists()
            result["playback_available"] = self.path("playback", identifier, ".mp3").exists()
            return result


def presets():
    return {
        key: {
            "model": os.getenv("STUDIO_MODEL_" + key.upper(), model),
            "memory": memory,
            "download_mb": size,
            "description": description,
        }
        for key, model, memory, size, description in [
            ("fast", "base", "~1 GB", 150, "Quick notes & clear speech"),
            ("balanced", "small", "~2 GB", 500, "A little more attention to detail"),
            ("accurate", "medium", "~5 GB", 1500, "For the words that matter most"),
        ]
    }
