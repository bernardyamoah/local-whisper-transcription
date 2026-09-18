"""Isolated inference process. Killing its process group also stops FFmpeg."""

import contextlib
import importlib.metadata
import json
import math
import os
import re
import signal
import subprocess
import sys
import threading
import time
import wave
from pathlib import Path


class ProgressReporter:
    """Turn model progress and a conservative heartbeat into monotonic job progress."""

    def __init__(self, emit, duration, provider):
        self.emit = emit
        self.duration = max(float(duration), 0.1)
        self.provider = provider
        self.value = 5.0
        self.lock = threading.Lock()

    def report(self, value):
        value = min(94.0, max(5.0, float(value)))
        with self.lock:
            if value <= self.value + 0.05:
                return
            self.value = value
            self.emit(stage="transcribing", progress=round(value, 1))

    def write(self, message):
        for percentage in re.findall(r"(\d+(?:\.\d+)?)%", message):
            self.report(5 + float(percentage) * 0.89)
        return len(message)

    def flush(self):
        return None

    def pulse(self, stop):
        expected = max(4.0, self.duration * (0.08 if self.provider == "deepgram" else 0.35))
        started = time.monotonic()
        while not stop.wait(0.5):
            elapsed = time.monotonic() - started
            estimate = 5 + 88 * (1 - math.exp(-elapsed / expected))
            self.report(min(93, estimate))


def transcribe(transcriber, source, language):
    options = {
        "language": None if language == "auto" else language,
        "word_timestamps": False,
        "verbose": False,
    }
    passes = (
        options,
        options | {"no_speech_threshold": 0.9, "log_prob_threshold": -2.0},
    )
    for settings in passes:
        response = transcriber(source, **settings)
        result = [
            {
                "start": segment["start"],
                "end": segment["end"],
                "text": segment["text"].strip(),
                "confidence": segment.get("avg_logprob"),
            }
            for segment in response["segments"]
            if segment["text"].strip()
        ]
        if result:
            return result, response["language"]
    return [], response["language"]


def main():
    source, normalized, playback, model_path, language, hardware, output, events, provider = sys.argv[1:]
    expected_parent = int(os.getenv("STUDIO_PARENT_PID", str(os.getppid())))

    def watch_parent():
        while True:
            if os.getppid() != expected_parent:
                if os.getpid() == os.getpgrp():
                    os.killpg(os.getpgrp(), signal.SIGTERM)
                os._exit(1)
            threading.Event().wait(1)

    threading.Thread(target=watch_parent, daemon=True).start()

    event_lock = threading.Lock()

    def emit(**event):
        with event_lock, open(events, "a") as stream:
            stream.write(json.dumps(event) + "\n")

    try:
        subprocess.run(
            [
                "ffmpeg",
                "-nostdin",
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-format_whitelist",
                "mp3,wav,mov,aac,flac,ogg,matroska,webm",
                "-i",
                source,
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-y",
                normalized,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        with wave.open(normalized, "rb") as audio:
            duration = audio.getnframes() / audio.getframerate()
        reporter = ProgressReporter(emit, duration, provider)
        reporter_stop = threading.Event()
        reporter_thread = threading.Thread(
            target=reporter.pulse,
            args=(reporter_stop,),
            daemon=True,
            name="transcription-progress",
        )
        emit(
            stage="transcribing",
            progress=5,
            backend="deepgram" if provider == "deepgram" else "mlx",
        )
        reporter_thread.start()
        try:
            if provider == "deepgram":
                from studio.deepgram import transcribe_file

                key = os.environ.get("DEEPGRAM_API_KEY", "")
                if not key:
                    raise RuntimeError("Deepgram is not connected.")
                cloud = transcribe_file(Path(normalized), key, language)
                result = cloud["segments"]
                detected_language = cloud["language"]
                engine_version = cloud["version"]
                meeting_notes = {
                    "summary": cloud.get("summary", ""),
                    "chapters": cloud.get("chapters", []),
                    "topics": cloud.get("topics", []),
                }
            else:
                import mlx_whisper

                if hardware not in {"auto", "apple"}:
                    raise RuntimeError(
                        "This build uses Apple Silicon acceleration. Choose Automatic or Apple MLX."
                    )

                def run(audio, **options):
                    with contextlib.redirect_stderr(reporter):
                        return mlx_whisper.transcribe(audio, path_or_hf_repo=model_path, **options)

                result, detected_language = transcribe(run, normalized, language)
                engine_version = importlib.metadata.version("mlx-whisper")
                meeting_notes = {"summary": "", "chapters": [], "topics": []}
        finally:
            reporter_stop.set()
            reporter_thread.join(timeout=1)
        emit(stage="saving", progress=96)
        playback_command = (
            [
                "ffmpeg",
                "-nostdin",
                "-v",
                "error",
                "-i",
                source,
                "-map",
                "0:v:0",
                "-map",
                "0:a:0",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "24",
                "-vf",
                "scale='min(1280,iw)':-2",
                "-c:a",
                "aac",
                "-b:a",
                "96k",
                "-movflags",
                "+faststart",
                "-y",
                playback,
            ]
            if Path(playback).suffix == ".mp4"
            else [
                "ffmpeg",
                "-nostdin",
                "-v",
                "error",
                "-i",
                normalized,
                "-codec:a",
                "libmp3lame",
                "-b:a",
                "64k",
                "-y",
                playback,
            ]
        )
        subprocess.run(
            playback_command,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        Path(output).write_text(
            json.dumps(
                {
                    "segments": result,
                    "language": detected_language,
                    "version": engine_version,
                    **meeting_notes,
                }
            )
        )
    except MemoryError:
        emit(error="Not enough memory. Try the Fast preset or close other applications.")
        sys.exit(1)
    except Exception as error:
        emit(
            error=(
                str(error)
                if provider == "deepgram"
                else "Processing failed. Check FFmpeg, available disk space, and the installed model; then retry."
            ),
            category=type(error).__name__,
            detail=str(error),
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
