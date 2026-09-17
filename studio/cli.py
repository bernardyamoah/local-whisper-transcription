import fcntl
import os
from pathlib import Path

import uvicorn


def main():
    os.umask(0o077)
    root = Path(os.getenv("STUDIO_DATA", "~/.local/share/whisper-studio")).expanduser()
    root.mkdir(parents=True, exist_ok=True)
    with (root / "studio.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Whisper Studio is already running with this data directory.")
        uvicorn.run(
            "studio.app:create_app",
            factory=True,
            host="127.0.0.1",
            port=int(os.getenv("STUDIO_PORT", "8765")),
            workers=1,
            proxy_headers=False,
            access_log=False,
        )


if __name__ == "__main__":
    main()
