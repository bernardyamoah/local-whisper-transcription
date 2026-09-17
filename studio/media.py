import json
import shutil
import subprocess


class MediaError(ValueError):
    pass


def probe(path, max_hours):
    if not shutil.which("ffprobe"):
        raise MediaError("FFprobe is missing. Install FFmpeg, then try again.")
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-format_whitelist",
                "mp3,wav,mov,aac,flac,ogg,matroska,webm",
                "-show_format",
                "-show_streams",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            timeout=30,
            check=True,
        )
        data = json.loads(result.stdout)
        audio = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)
        if audio is None:
            raise MediaError("This recording has no readable audio track.")
        duration = float(data.get("format", {}).get("duration", audio.get("duration", 0)))
        if not 0 < duration <= max_hours * 3600:
            raise MediaError(f"Choose a recording between 0 seconds and {max_hours:g} hours.")
        return {
            "duration": duration,
            "container": data["format"].get("format_name", "unknown"),
            "codec": audio.get("codec_name", "unknown"),
        }
    except (subprocess.SubprocessError, ValueError, KeyError) as error:
        if isinstance(error, MediaError):
            raise
        raise MediaError("This file is corrupt, encrypted, or cannot be decoded by FFmpeg.") from error
