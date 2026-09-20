"""Headless engine owned by the SwiftUI application; never creates a webview."""
from __future__ import annotations

import json
import multiprocessing
import os
import signal
from contextlib import contextmanager
import sys
import threading
import time
from pathlib import Path

import uvicorn

from studio.app import create_app
from studio.macos import (
    application_data_directory, application_lock, configure_environment,
    engine_command, loopback_socket, model_command, run_engine, run_model_download,
)


class LocalServer(uvicorn.Server):
    @contextmanager
    def capture_signals(self):
        # Uvicorn normally re-raises SIGTERM after shutdown, bypassing ready-file cleanup.
        previous = {sig: signal.signal(sig, self.handle_exit) for sig in (signal.SIGINT, signal.SIGTERM)}
        try:
            yield
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)


def main():
    multiprocessing.freeze_support()
    if len(sys.argv) > 1 and sys.argv[1] == "--engine":
        run_engine()
        return
    if len(sys.argv) > 1 and sys.argv[1] == "--model-download":
        run_model_download()
        return
    ready = Path(sys.argv[sys.argv.index("--ready-file") + 1])
    parent = os.getppid()
    root = application_data_directory()
    configure_environment(root)
    try:
        with application_lock(root), loopback_socket() as sock:
            app = create_app(root=root, command=engine_command(), model_command=model_command())
            port = sock.getsockname()[1]
            server = LocalServer(uvicorn.Config(app, host="127.0.0.1", port=port,
                access_log=False, proxy_headers=False, log_level="warning"))

            def supervise():
                while not server.should_exit:
                    if os.getppid() != parent:
                        server.should_exit = True
                        return
                    if server.started and not ready.exists():
                        temporary = ready.with_suffix(".tmp")
                        temporary.write_text(json.dumps({"url": f"http://127.0.0.1:{port}"}))
                        temporary.replace(ready)
                    time.sleep(0.2)
            threading.Thread(target=supervise, daemon=True).start()
            server.run(sockets=[sock])
    finally:
        ready.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
