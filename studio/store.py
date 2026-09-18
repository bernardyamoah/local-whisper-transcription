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
    "onboarding_completed": False,
    "max_duration_hours": 4,
    "hardware": "auto",
    "transcription_provider": "local",
    "appearance": "system",
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
            """)
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version < 2:
                db.execute("ALTER TABLE jobs ADD COLUMN provider TEXT NOT NULL DEFAULT 'local'")
                db.execute("ALTER TABLE segments ADD COLUMN speaker INTEGER")
                db.execute("PRAGMA user_version=2")
                version = 2
            if version < 3:
                db.execute("ALTER TABLE segments ADD COLUMN speaker_name TEXT")
                db.execute("ALTER TABLE segments ADD COLUMN words TEXT")
                db.execute("""CREATE TABLE IF NOT EXISTS meeting_notes (
                  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
                  summary TEXT NOT NULL DEFAULT '',
                  chapters TEXT NOT NULL DEFAULT '[]',
                  topics TEXT NOT NULL DEFAULT '[]')""")
                db.execute("PRAGMA user_version=3")
                version = 3
            if version < 4:
                db.execute("ALTER TABLE media ADD COLUMN has_video INTEGER NOT NULL DEFAULT 0")
                db.execute("PRAGMA user_version=4")
                version = 4
            if version < 5:
                db.execute("ALTER TABLE jobs ADD COLUMN template TEXT NOT NULL DEFAULT 'general'")
                db.execute("""CREATE TABLE IF NOT EXISTS bookmarks (
                  id TEXT PRIMARY KEY,
                  media_id TEXT NOT NULL,
                  at REAL NOT NULL,
                  kind TEXT NOT NULL,
                  note TEXT NOT NULL DEFAULT '',
                  created REAL NOT NULL)""")
                db.execute("CREATE INDEX IF NOT EXISTS bookmarks_media ON bookmarks(media_id, at)")
                db.execute("PRAGMA user_version=5")

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
        if suffix not in {"", ".wav", ".mp3", ".mp4", ".json", ".jsonl", ".part"}:
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
                """SELECT j.*, m.name AS filename, m.duration, m.size, m.retained, m.has_video
                FROM jobs j JOIN media m ON m.id=j.media_id WHERE j.id=?""",
                (identifier,),
            ).fetchone()
            if row is None:
                raise KeyError(identifier)
            result = dict(row)
            result["has_video"] = bool(result["has_video"])
            result["source_available"] = self.path("sources", result["media_id"]).exists()
            result["playback_kind"] = "video" if result["has_video"] else "audio"
            suffix = ".mp4" if result["has_video"] else ".mp3"
            result["playback_available"] = self.path("playback", identifier, suffix).exists()
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
            ("fast", "small", "~2 GB", 500, "Quick · lighter memory use"),
            ("balanced", "turbo", "~6 GB", 1600, "Recommended for this Mac"),
            ("accurate", "large-v3", "~10 GB", 3000, "Precise · close other demanding apps"),
        ]
    }
