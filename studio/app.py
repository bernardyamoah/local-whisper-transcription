import hashlib
import importlib.metadata
import json
import logging
import logging.handlers
import os
import shutil
import sqlite3
import subprocess
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from urllib.parse import quote, unquote

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool

from studio import __version__
from studio.deepgram import Deepgram, DeepgramError
from studio.destinations import DestinationError, ExportDestinations
from studio.exports import filename, render_bundle, render_document
from studio.jev import Jev, JevError, SmartMoments
from studio.jobs import ACTIVE, Orchestrator
from studio.media import MediaError, create_playback, probe
from studio.models import MODEL_INFO, Models
from studio.native import NativeBridge
from studio.security import Boundary
from studio.store import Store, presets
from studio.templates import MEETING_TEMPLATES, templates
from studio.templates import template as meeting_template


class Settings(BaseModel):
    language: str = "auto"
    preset: Literal["fast", "balanced", "accurate"] = "balanced"
    retain_source: bool = True
    onboarding_completed: bool = False
    max_duration_hours: float = Field(default=4, gt=0, le=24)
    hardware: Literal["auto", "apple"] = "auto"
    transcription_provider: Literal["local", "deepgram"] = "local"
    smart_moments: bool = False
    appearance: Literal["light", "dark", "system"] = "system"

    @field_validator("language")
    @classmethod
    def language_supported(cls, value):
        from mlx_whisper.tokenizer import LANGUAGES

        if value != "auto" and value not in LANGUAGES:
            raise ValueError("Unsupported Whisper language")
        return value


class NewJob(BaseModel):
    media_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    title: str = Field(default="", max_length=200)
    language: str = "auto"
    preset: Literal["fast", "balanced", "accurate"] = "balanced"
    model: str | None = None
    provider: Literal["local", "deepgram"] | None = None
    template: Literal["general", "standup", "interview", "customer", "lecture"] = "general"

    @field_validator("language")
    @classmethod
    def language_supported(cls, value):
        return Settings.language_supported(value)

    @field_validator("model")
    @classmethod
    def model_supported(cls, value):
        if value is not None and value not in MODEL_INFO:
            raise ValueError("Unsupported model")
        return value


class SegmentEdit(BaseModel):
    id: int
    text: str = Field(max_length=20000)


class SpeakerEdit(BaseModel):
    speaker: int = Field(ge=0)
    name: str = Field(max_length=80)


class Edit(BaseModel):
    revision: int = Field(ge=0)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    segments: list[SegmentEdit] = Field(default_factory=list, max_length=10000)
    speakers: list[SpeakerEdit] = Field(default_factory=list, max_length=100)


class Delete(BaseModel):
    scope: Literal["transcript", "all"]
    confirm: Literal[True]


class Install(BaseModel):
    confirm: Literal[True]


class StartRecording(BaseModel):
    name: str = Field(default="Meeting recording", max_length=200)
    language: str = "auto"
    template: Literal["general", "standup", "interview", "customer", "lecture"] = "general"

    @field_validator("language")
    @classmethod
    def language_supported(cls, value):
        return Settings.language_supported(value)


class BookmarkCreate(BaseModel):
    kind: str = Field(min_length=1, max_length=40)
    note: str = Field(default="", max_length=240)


class JobBookmarkCreate(BookmarkCreate):
    at: float = Field(ge=0, le=24 * 60 * 60)


class ProviderKey(BaseModel):
    api_key: str = Field(min_length=20, max_length=500)


class DestinationSettings(BaseModel):
    obsidian_vault: str | None = Field(default=None, max_length=2000)
    obsidian_folder: str | None = Field(default=None, max_length=300)
    notion_token: str | None = Field(default=None, max_length=1000)
    notion_parent_id: str | None = Field(default=None, max_length=200)
    webhook_url: str | None = Field(default=None, max_length=2000)
    webhook_secret: str | None = Field(default=None, max_length=1000)


class Delivery(BaseModel):
    view: Literal["transcript", "minutes", "actions"] = "minutes"


def create_app(
    root=None,
    worker=True,
    command=None,
    model_command=None,
    native_command=None,
    deepgram=None,
    jev=None,
):
    store = Store(root or os.getenv("STUDIO_DATA", "~/.local/share/whisper-studio"))
    models, choices = Models(store, command=model_command), presets()
    deepgram = deepgram or Deepgram(store.root)
    jev = jev or Jev(store.root)
    destinations = ExportDestinations(store.root)
    smart_moments = SmartMoments(store, jev)
    jobs = Orchestrator(store, command, models.path, deepgram.key, smart_moments.submit_job)
    native = NativeBridge(store.root, native_command, smart_moments.submit_live)
    for preset in choices.values():
        models.path(preset["model"])
    handler = logging.handlers.RotatingFileHandler(
        store.root / "logs" / "studio.log", maxBytes=1_000_000, backupCount=3
    )
    logger = logging.getLogger("studio")
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

    @asynccontextmanager
    async def lifespan(app):
        smart_moments.start()
        if worker:
            jobs.start()
        else:
            jobs.recover()
        yield
        jobs.close()
        native.close()
        smart_moments.close()
        models.close()
        logger.removeHandler(handler)
        handler.close()

    app = FastAPI(title="Whisper Studio", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store, app.state.jobs, app.state.models, app.state.native = store, jobs, models, native
    app.state.deepgram, app.state.jev, app.state.smart_moments = deepgram, jev, smart_moments
    app.state.destinations = destinations
    app.middleware("http")(Boundary())

    @app.exception_handler(KeyError)
    async def missing(request, error):
        return JSONResponse({"detail": "That item could not be found."}, status_code=404)

    @app.exception_handler(ValueError)
    async def invalid(request, error):
        return JSONResponse({"detail": str(error)}, status_code=400)

    @app.exception_handler(sqlite3.Error)
    async def database_error(request, error):
        logger.error("Database failure: %s", type(error).__name__)
        return JSONResponse(
            {
                "detail": "The local database is unavailable. Check disk space and permissions; restart after restoring access."
            },
            status_code=503,
        )

    @app.exception_handler(OSError)
    async def storage_error(request, error):
        logger.error("Filesystem failure: %s", type(error).__name__)
        return JSONResponse(
            {"detail": "A local file operation failed. Check disk space and data directory permissions."},
            status_code=507,
        )

    @app.get("/api/environment")
    def environment(request: Request):
        from mlx_whisper.tokenizer import LANGUAGES

        disk = shutil.disk_usage(store.root)
        ffmpeg = shutil.which("ffmpeg")
        version = (
            subprocess.run(
                [ffmpeg, "-version"], capture_output=True, text=True, timeout=5
            ).stdout.splitlines()[0]
            if ffmpeg
            else None
        )
        with store.connect() as db:
            healthy = db.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        return {
            "version": __version__,
            "ffmpeg": version,
            "ffprobe": bool(shutil.which("ffprobe")),
            "runtime": importlib.metadata.version("mlx-whisper"),
            "database": healthy,
            "free_bytes": disk.free,
            "used_bytes": sum(p.stat().st_size for p in store.root.rglob("*") if p.is_file()),
            "data_location": str(store.root),
            "compute": "mlx",
            "presets": {k: v | models.status(v["model"]) for k, v in choices.items()},
            "models": models.catalog(),
            "languages": list(LANGUAGES),
            "origin": "healthy",
            "native": native.capabilities(),
            "deepgram": {"configured": deepgram.configured()},
            "jev": {
                "configured": jev.configured(),
                "enabled": jev.configured() and store.settings()["smart_moments"],
            },
            "meeting_templates": templates(),
        }

    @app.post("/api/providers/deepgram")
    def connect_deepgram(payload: ProviderKey):
        try:
            deepgram.connect(payload.api_key)
        except DeepgramError as error:
            raise HTTPException(400, str(error)) from error
        return {"configured": True}

    @app.delete("/api/providers/deepgram")
    def disconnect_deepgram(payload: Install):
        deepgram.disconnect()
        return {"configured": False}

    @app.post("/api/providers/jev")
    def connect_jev(payload: ProviderKey):
        try:
            jev.connect(payload.api_key)
        except JevError as error:
            raise HTTPException(400, str(error)) from error
        store.update_settings({"smart_moments": True})
        return {"configured": True, "enabled": True}

    @app.delete("/api/providers/jev")
    def disconnect_jev(payload: Install):
        jev.disconnect()
        store.update_settings({"smart_moments": False})
        return {"configured": False, "enabled": False}

    @app.get("/api/diagnostics")
    def diagnostics(request: Request):
        result = environment(request)
        del result["data_location"]
        del result["languages"]
        return Response(
            json.dumps(result, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="studio-diagnostics.json"'},
        )

    @app.get("/api/settings")
    def settings():
        return store.settings()

    @app.put("/api/settings")
    def update_settings(payload: Settings):
        return store.update_settings(payload.model_dump())

    @app.get("/api/export-destinations")
    def export_destinations():
        return destinations.get()

    @app.put("/api/export-destinations")
    def update_export_destinations(payload: DestinationSettings):
        return destinations.update(payload.model_dump(exclude_unset=True))

    @app.post("/api/models/{model}")
    def install(model: str, payload: Install):
        if model not in MODEL_INFO:
            raise HTTPException(404, "Unknown model")
        return models.install(model)

    @app.delete("/api/models/{model}")
    def delete_model(model: str, payload: Install):
        if model not in MODEL_INFO:
            raise HTTPException(404, "Unknown model")
        with jobs.lock, store.connect() as db:
            active = db.execute(
                "SELECT 1 FROM jobs WHERE model=? AND state IN ('queued','preparing','transcribing','saving','cancelling')",
                (model,),
            ).fetchone()
            if active:
                raise HTTPException(409, "This model is being used by an active transcription.")
            return models.delete(model)

    @app.post("/api/media", status_code=201)
    async def upload(request: Request):
        identifier = uuid.uuid4().hex
        target = store.path("sources", identifier)
        temporary = store.path("temporary", identifier, ".part")
        name = unquote(request.headers.get("x-filename", "recording"))[:240].replace("\x00", "")
        size, checksum = 0, hashlib.sha256()
        try:
            with temporary.open("wb") as file:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > 8 * 1024**3:
                        raise HTTPException(413, "The maximum upload size is 8 GB. Use a smaller recording.")
                    if shutil.disk_usage(store.root).free < len(chunk) + 256 * 1024**2:
                        raise HTTPException(507, "Not enough free disk space. Free some space and try again.")
                    checksum.update(chunk)
                    await run_in_threadpool(file.write, chunk)
            if not size:
                raise MediaError("This file is empty. Choose a recording with audio.")
            info = await run_in_threadpool(probe, temporary, store.settings()["max_duration_hours"])
            temporary.replace(target)
            with store.connect() as db:
                db.execute(
                    """INSERT INTO media(
                      id,name,size,duration,container,codec,checksum,created,has_video
                    ) VALUES(?,?,?,?,?,?,?,?,?)""",
                    (
                        identifier,
                        name,
                        size,
                        info["duration"],
                        info["container"],
                        info["codec"],
                        checksum.hexdigest(),
                        time.time(),
                        info["has_video"],
                    ),
                )
            return {"id": identifier, "name": name, "size": size} | info
        except BaseException:
            target.unlink(missing_ok=True)
            raise
        finally:
            temporary.unlink(missing_ok=True)

    @app.get("/api/media")
    def retained_media():
        with store.connect() as db:
            return [
                dict(r)
                for r in db.execute(
                    "SELECT * FROM media WHERE retained=1 AND id NOT IN (SELECT media_id FROM jobs) ORDER BY created DESC"
                )
            ]

    @app.delete("/api/media/{identifier}")
    def delete_media(identifier: str, payload: Install):
        with jobs.lock, store.connect() as db:
            if db.execute("SELECT 1 FROM jobs WHERE media_id=?", (identifier,)).fetchone():
                raise HTTPException(409, "Delete the associated transcription first.")
            if not db.execute("SELECT 1 FROM media WHERE id=?", (identifier,)).fetchone():
                raise KeyError(identifier)
            store.path("sources", identifier).unlink(missing_ok=True)
            db.execute("DELETE FROM bookmarks WHERE media_id=?", (identifier,))
            db.execute("DELETE FROM media WHERE id=?", (identifier,))
        return {"deleted": True}

    @app.get("/api/recordings")
    def recording_status():
        recording = native.status()
        if recording["state"] == "recording":
            with store.connect() as db:
                recording["bookmarks"] = [
                    dict(bookmark)
                    for bookmark in db.execute(
                        "SELECT id,at,kind,note,created,source,confidence FROM bookmarks WHERE media_id=? ORDER BY at,created",
                        (recording["id"],),
                    )
                ]
        return recording

    @app.post("/api/recordings", status_code=201)
    def start_recording(payload: StartRecording):
        try:
            return native.start(payload.name.strip(), payload.language, payload.template)
        except RuntimeError as error:
            raise HTTPException(409, str(error)) from error

    @app.post("/api/recordings/bookmarks", status_code=201)
    def add_recording_bookmark(payload: BookmarkCreate):
        recording = native.status()
        if recording["state"] != "recording":
            raise HTTPException(409, "Start a meeting recording before adding a bookmark.")
        allowed = MEETING_TEMPLATES[recording["template"]]["bookmarks"]
        if payload.kind not in allowed:
            raise HTTPException(400, "This bookmark is not part of the selected meeting template.")
        bookmark = {
            "id": uuid.uuid4().hex,
            "media_id": recording["id"],
            "at": recording["elapsed"],
            "kind": payload.kind,
            "note": payload.note.strip(),
            "created": time.time(),
            "source": "manual",
            "confidence": None,
        }
        with store.connect() as db:
            db.execute(
                """INSERT INTO bookmarks(
                     id,media_id,at,kind,note,created,source,confidence
                   ) VALUES(?,?,?,?,?,?,?,?)""",
                tuple(bookmark.values()),
            )
        return bookmark

    @app.post("/api/recordings/stop", status_code=201)
    def stop_recording():
        try:
            recording = native.stop()
        except RuntimeError as error:
            raise HTTPException(409, str(error)) from error
        identifier = recording["id"]
        temporary = recording["path"]
        target = store.path("sources", identifier)
        info = probe(temporary, store.settings()["max_duration_hours"])
        checksum = hashlib.sha256()
        with temporary.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                checksum.update(chunk)
        size = temporary.stat().st_size
        job_id = uuid.uuid4().hex
        # ScreenCaptureKit includes a placeholder video track in meeting files.
        # Meetings are audio documents regardless of that implementation detail.
        info["has_video"] = False
        playback = store.path("playback", job_id, ".mp3")
        if not create_playback(temporary, playback, False):
            raise HTTPException(422, "The meeting was saved but audio playback could not be prepared.")
        temporary.replace(target)
        live = list(recording["live_transcript"])
        live.extend(recording["interim"].values())
        live.sort(key=lambda item: (item.get("start", 0), item.get("source", "")))
        segments = []
        for item in live:
            text = item.get("text", "").strip()
            if not text:
                continue
            start = min(info["duration"], max(0, float(item.get("start", 0))))
            end = min(info["duration"], max(start, float(item.get("end", start))))
            segments.append({**item, "text": text, "start": start, "end": end})
        settings = store.settings()
        preset = settings["preset"]
        media = {
            "id": identifier,
            "name": recording["name"] + ".mp4",
            "size": size,
            "checksum": checksum.hexdigest(),
        } | info
        try:
            return jobs.complete_live(
                job_id,
                media,
                recording["name"],
                recording["language"],
                preset,
                choices[preset]["model"],
                recording["template"],
                segments,
                recording["started"],
            )
        except BaseException:
            # Keep the captured meeting recoverable if saving its transcript fails.
            target.replace(temporary)
            playback.unlink(missing_ok=True)
            raise

    @app.post("/api/jobs", status_code=201)
    def create_job(payload: NewJob):
        provider = payload.provider or store.settings()["transcription_provider"]
        model = (
            "nova-3-general" if provider == "deepgram" else payload.model or choices[payload.preset]["model"]
        )
        if provider == "deepgram" and not deepgram.configured():
            raise HTTPException(409, "Connect Deepgram in Settings before starting.")
        if provider == "local" and not models.status(model)["installed"]:
            raise HTTPException(409, "Install this quality preset in Settings before starting.")
        if not shutil.which("ffmpeg"):
            raise HTTPException(409, "Install FFmpeg before starting a transcription.")
        return jobs.create(
            payload.media_id,
            payload.title.strip(),
            payload.language,
            payload.preset,
            model,
            provider,
            payload.template,
        )

    @app.get("/api/jobs")
    def history(q: str = "", sort: str = "newest", offset: int = 0, limit: int = 50):
        order = {
            "newest": "j.created DESC",
            "oldest": "j.created ASC",
            "title": "j.title COLLATE NOCASE",
            "duration": "m.duration DESC",
            "status": "j.state",
        }.get(sort, "j.created DESC")
        query = """ FROM jobs j JOIN media m ON j.media_id=m.id
          WHERE j.title LIKE ? OR m.name LIKE ?
          OR EXISTS (SELECT 1 FROM segments s WHERE s.job_id=j.id AND (s.text LIKE ? OR s.speaker_name LIKE ?))
          OR EXISTS (SELECT 1 FROM meeting_notes n WHERE n.job_id=j.id AND (n.summary LIKE ? OR n.chapters LIKE ? OR n.topics LIKE ?))"""
        with store.connect() as db:
            args = (f"%{q[:200]}%",) * 7
            total = db.execute("SELECT COUNT(*)" + query, args).fetchone()[0]
            rows = db.execute(
                "SELECT j.*,m.name AS filename,m.duration,m.size,m.retained,m.has_video"
                + query
                + f" ORDER BY {order} LIMIT ? OFFSET ?",
                (*args, max(1, min(limit, 100)), max(offset, 0)),
            )
            return {"items": [dict(r) for r in rows], "total": total}

    @app.get("/api/jobs/{identifier}")
    def detail(identifier: str):
        job = store.job(identifier)
        with store.connect() as db:
            job["segments"] = [
                dict(s)
                for s in db.execute("SELECT * FROM segments WHERE job_id=? ORDER BY sequence", (identifier,))
            ]
            for segment in job["segments"]:
                segment["words"] = json.loads(segment["words"] or "[]")
            notes = db.execute("SELECT * FROM meeting_notes WHERE job_id=?", (identifier,)).fetchone()
            job["notes"] = (
                {
                    "summary": notes["summary"],
                    "chapters": json.loads(notes["chapters"]),
                    "topics": json.loads(notes["topics"]),
                }
                if notes
                else {"summary": "", "chapters": [], "topics": []}
            )
            job["template"] = meeting_template(job["template"])
            job["bookmarks"] = [
                dict(bookmark)
                for bookmark in db.execute(
                    "SELECT id,at,kind,note,created,source,confidence FROM bookmarks WHERE media_id=? ORDER BY at,created",
                    (job["media_id"],),
                )
            ]
        return job

    @app.post("/api/jobs/{identifier}/bookmarks", status_code=201)
    def add_job_bookmark(identifier: str, payload: JobBookmarkCreate):
        job = store.job(identifier)
        if payload.at > job["duration"] + 1:
            raise HTTPException(400, "The bookmark is outside this recording.")
        allowed = MEETING_TEMPLATES[job["template"]]["bookmarks"]
        if payload.kind not in allowed:
            raise HTTPException(400, "This bookmark is not part of the selected meeting template.")
        bookmark = {
            "id": uuid.uuid4().hex,
            "media_id": job["media_id"],
            "at": payload.at,
            "kind": payload.kind,
            "note": payload.note.strip(),
            "created": time.time(),
            "source": "manual",
            "confidence": None,
        }
        with store.connect() as db:
            db.execute(
                """INSERT INTO bookmarks(
                     id,media_id,at,kind,note,created,source,confidence
                   ) VALUES(?,?,?,?,?,?,?,?)""",
                tuple(bookmark.values()),
            )
        return {key: value for key, value in bookmark.items() if key != "media_id"}

    @app.delete("/api/jobs/{identifier}/bookmarks/{bookmark_id}")
    def delete_job_bookmark(identifier: str, bookmark_id: str):
        job = store.job(identifier)
        with store.connect() as db:
            result = db.execute(
                "DELETE FROM bookmarks WHERE id=? AND media_id=?",
                (bookmark_id, job["media_id"]),
            )
            if result.rowcount != 1:
                raise KeyError(bookmark_id)
        return {"deleted": True}

    @app.post("/api/jobs/{identifier}/cancel")
    def cancel(identifier: str):
        return jobs.cancel(identifier)

    @app.post("/api/jobs/{identifier}/retry")
    def retry(identifier: str):
        job = store.job(identifier)
        if job["provider"] == "deepgram" and not deepgram.configured():
            raise HTTPException(409, "Reconnect Deepgram before retrying.")
        if job["provider"] == "local" and not models.status(job["model"])["installed"]:
            raise HTTPException(409, "Reinstall this job's model before retrying.")
        return jobs.retry(identifier)

    @app.patch("/api/jobs/{identifier}")
    def edit(identifier: str, payload: Edit):
        with store.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            job = store.job(identifier)
            if job["state"] != "completed":
                raise HTTPException(409, "This transcript is not ready to edit.")
            if job["revision"] != payload.revision:
                raise HTTPException(
                    409, "This transcript changed in another tab. Copy your unsaved edits, then reload."
                )
            for segment in payload.segments:
                result = db.execute(
                    "UPDATE segments SET text=? WHERE id=? AND job_id=?",
                    (segment.text, segment.id, identifier),
                )
                if result.rowcount != 1:
                    raise HTTPException(400, "The segment does not belong to this transcript.")
            for speaker in payload.speakers:
                db.execute(
                    "UPDATE segments SET speaker_name=? WHERE job_id=? AND speaker=?",
                    (speaker.name.strip() or None, identifier, speaker.speaker),
                )
            db.execute(
                "UPDATE jobs SET revision=revision+1, title=?, updated=? WHERE id=?",
                (payload.title or job["title"], time.time(), identifier),
            )
        return {"revision": payload.revision + 1}

    @app.get("/api/jobs/{identifier}/export/{kind}")
    def export(
        identifier: str,
        kind: str,
        view: Literal["transcript", "minutes", "actions"] = "transcript",
        timestamps: bool = False,
    ):
        job = detail(identifier)
        if job["state"] != "completed":
            raise HTTPException(409, "Wait until transcription is complete.")
        suffix = kind
        if kind == "bundle":
            media_path = None
            media_name = None
            if job["source_available"]:
                media_path = store.path("sources", job["media_id"])
                media_name = job["filename"]
            elif job["playback_available"]:
                suffix = ".mp4" if job["playback_kind"] == "video" else ".mp3"
                media_path = store.path("playback", identifier, suffix)
                media_name = "recording" + suffix
            content = render_bundle(job, media_path, media_name)
            media_type = "application/zip"
            suffix = "zip"
        else:
            content, media_type = render_document(job, kind, view, timestamps)
        label = {"minutes": "meeting-minutes", "actions": "action-items"}.get(view)
        stem = filename(job["title"] + (f" {label}" if label else ""))
        return Response(
            content,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{quote(stem + '.' + suffix)}"
            },
        )

    @app.post("/api/jobs/{identifier}/deliver/{destination}")
    def deliver(identifier: str, destination: str, payload: Delivery):
        job = detail(identifier)
        if job["state"] != "completed":
            raise HTTPException(409, "Wait until transcription is complete.")
        try:
            if destination == "obsidian":
                return destinations.save_obsidian(job, payload.view)
            if destination == "notion":
                return destinations.send_notion(job, payload.view)
            if destination == "webhook":
                return destinations.send_webhook(job, payload.view)
        except DestinationError as error:
            raise HTTPException(400, str(error)) from error
        raise HTTPException(404, "Unknown export destination")

    @app.get("/api/jobs/{identifier}/audio")
    def audio(identifier: str):
        job = store.job(identifier)
        path = store.path("playback", identifier, ".mp3")
        if job["playback_kind"] != "audio" or not job["playback_available"] or job["state"] != "completed":
            raise HTTPException(
                404, "Playback is unavailable. The recording may have been removed by retention settings."
            )
        return FileResponse(path, media_type="audio/mpeg")

    @app.get("/api/jobs/{identifier}/video")
    def video(identifier: str):
        job = store.job(identifier)
        path = store.path("playback", identifier, ".mp4")
        if job["playback_kind"] != "video" or not job["playback_available"] or job["state"] != "completed":
            raise HTTPException(
                404, "Playback is unavailable. The recording may have been removed by retention settings."
            )
        return FileResponse(path, media_type="video/mp4")

    @app.delete("/api/jobs/{identifier}")
    def delete(identifier: str, payload: Delete):
        with jobs.lock, store.connect() as db:
            job = store.job(identifier)
            if job["state"] in ACTIVE | {"queued"}:
                raise HTTPException(409, "Cancel processing before deleting this item.")
            # Remove files first. A partial filesystem failure leaves DB records visible for retry.
            store.path("playback", identifier, ".mp3").unlink(missing_ok=True)
            store.path("playback", identifier, ".mp4").unlink(missing_ok=True)
            if payload.scope == "all":
                store.path("sources", job["media_id"]).unlink(missing_ok=True)
            db.execute("DELETE FROM jobs WHERE id=?", (identifier,))
            if payload.scope == "all":
                db.execute("DELETE FROM bookmarks WHERE media_id=?", (job["media_id"],))
                db.execute("DELETE FROM media WHERE id=?", (job["media_id"],))
        return {
            "transcript": "deleted",
            "playback": "deleted",
            "source": "deleted" if payload.scope == "all" else "retained",
        }

    static = Path(__file__).parent / "static"
    app.mount(
        "/website", StaticFiles(directory=static / "website", html=True, check_dir=False), name="website"
    )
    app.mount("/static", StaticFiles(directory=static), name="static")
    app.mount("/assets", StaticFiles(directory=static / "assets"), name="assets")

    @app.get("/")
    def index():
        return FileResponse(static / "index.html")

    @app.get("/welcome")
    @app.get("/library")
    @app.get("/settings")
    @app.get("/jobs/{identifier}")
    def client_route(identifier: str | None = None):
        return FileResponse(static / "index.html")

    return app
