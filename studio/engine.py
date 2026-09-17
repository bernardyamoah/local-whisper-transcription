"""Isolated inference process. Killing its process group also stops FFmpeg."""

import importlib.metadata
import json
import os
import signal
import subprocess
import sys
import threading
from pathlib import Path


def main():
    source, normalized, playback, model_path, language, hardware, output, events = sys.argv[1:]
    expected_parent = int(os.getenv("STUDIO_PARENT_PID", str(os.getppid())))

    def watch_parent():
        while True:
            if os.getppid() != expected_parent:
                if os.getpid() == os.getpgrp():
                    os.killpg(os.getpgrp(), signal.SIGTERM)
                os._exit(1)
            threading.Event().wait(1)

    threading.Thread(target=watch_parent, daemon=True).start()

    def emit(**event):
        with open(events, "a") as stream:
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
        import ctranslate2
        from faster_whisper import WhisperModel

        backend = "cuda" if hardware != "cpu" and ctranslate2.get_cuda_device_count() else "cpu"
        if hardware == "cuda" and backend != "cuda":
            raise RuntimeError("CUDA was requested but is unavailable. Choose Auto or CPU in settings.")
        emit(stage="transcribing", progress=5, backend=backend)
        model = WhisperModel(
            model_path,
            device=backend,
            compute_type="int8" if backend == "cpu" else "float16",
            cpu_threads=max(1, (os.cpu_count() or 2) // 2),
            local_files_only=True,
        )
        segments, info = model.transcribe(
            normalized, language=None if language == "auto" else language, vad_filter=True, beam_size=5
        )
        result = []
        for segment in segments:
            result.append(
                {
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text.strip(),
                    "confidence": segment.avg_logprob,
                }
            )
            emit(stage="transcribing", progress=min(94, 5 + 89 * segment.end / max(info.duration, 1)))
        emit(stage="saving", progress=96)
        subprocess.run(
            [
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
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        Path(output).write_text(
            json.dumps(
                {
                    "segments": result,
                    "language": info.language,
                    "version": importlib.metadata.version("faster-whisper"),
                }
            )
        )
    except MemoryError:
        emit(error="Not enough memory. Try the Fast preset or close other applications.")
        sys.exit(1)
    except Exception as error:
        emit(
            error="Processing failed. Check FFmpeg, available disk space, and the installed model; then retry.",
            category=type(error).__name__,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
