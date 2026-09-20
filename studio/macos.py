"""Native macOS host for Whisper Studio.

The web application remains the single UI implementation. This module owns the
native window and the lifecycle of the loopback FastAPI server when distributed
as a macOS application bundle.
"""

from __future__ import annotations

import base64
import fcntl
import multiprocessing
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from contextlib import contextmanager
from pathlib import Path

import uvicorn

from studio.app import create_app
from studio.exports import filename

APP_NAME = "Whisper Studio"
STARTUP_TIMEOUT = 30


EXPORT_SUFFIXES = {".txt", ".srt", ".vtt", ".md", ".pdf", ".docx", ".csv", ".json", ".zip"}


def save_export_file(name: str, content: str, directory: Path | None = None) -> str:
    return save_export_bytes(name, content.encode("utf-8"), directory)


def export_target(name: str, directory: Path | None = None):
    suffix = Path(name).suffix.lower()
    if suffix not in EXPORT_SUFFIXES:
        raise ValueError("Unsupported export format")
    destination = directory or Path.home() / "Downloads"
    destination.mkdir(parents=True, exist_ok=True)
    stem = filename(Path(name).stem)
    attempt = 1
    while True:
        label = stem if attempt == 1 else f"{stem} {attempt}"
        target = destination / f"{label}{suffix}"
        try:
            descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            return descriptor, target
        except FileExistsError:
            attempt += 1


def save_export_bytes(name: str, content: bytes, directory: Path | None = None) -> str:
    descriptor, target = export_target(name, directory)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    return str(target)


class SystemNotifications:
    """Native macOS Notification Center bridge exposed to the web UI."""

    def __init__(self):
        import UserNotifications as notifications
        from Foundation import NSObject

        class Delegate(NSObject):
            def userNotificationCenter_willPresentNotification_withCompletionHandler_(
                self, center, notification, completion
            ):
                completion(
                    notifications.UNNotificationPresentationOptionBanner
                    | notifications.UNNotificationPresentationOptionSound
                )

        self.notifications = notifications
        self.center = notifications.UNUserNotificationCenter.currentNotificationCenter()
        self.delegate = Delegate.alloc().init()
        self.center.setDelegate_(self.delegate)

    def request_permission(self) -> bool:
        options = (
            self.notifications.UNAuthorizationOptionAlert | self.notifications.UNAuthorizationOptionSound
        )
        self.center.requestAuthorizationWithOptions_completionHandler_(options, lambda granted, error: None)
        return True

    def notify(self, title: str, body: str) -> bool:
        content = self.notifications.UNMutableNotificationContent.alloc().init()
        content.setTitle_(title[:120])
        content.setBody_(body[:500])
        content.setSound_(self.notifications.UNNotificationSound.defaultSound())
        request = self.notifications.UNNotificationRequest.requestWithIdentifier_content_trigger_(
            str(uuid.uuid4()), content, None
        )
        self.center.addNotificationRequest_withCompletionHandler_(request, lambda error: None)
        return True

    def save_export(self, name: str, content: str) -> str:
        return save_export_file(name, content)

    def save_export_base64(self, name: str, content: str) -> str:
        return save_export_bytes(name, base64.b64decode(content, validate=True))

    def save_export_url(self, name: str, url: str) -> str:
        parsed = urllib.parse.urlparse(url)
        if parsed.hostname not in {"127.0.0.1", "localhost"} or not parsed.path.startswith("/api/jobs/"):
            raise ValueError("Invalid local export URL")
        descriptor, target = export_target(name)
        request = urllib.request.Request(url, headers={"X-Studio-Request": "1"})
        try:
            with urllib.request.urlopen(request, timeout=120) as response, os.fdopen(descriptor, "wb") as stream:
                while chunk := response.read(1024 * 1024):
                    stream.write(chunk)
        except Exception:
            try:
                os.close(descriptor)
            except OSError:
                pass
            target.unlink(missing_ok=True)
            raise
        return str(target)


def application_data_directory() -> Path:
    configured = os.getenv("STUDIO_DATA")
    if configured:
        return Path(configured).expanduser()
    return Path.home() / "Library" / "Application Support" / APP_NAME


def bundle_root() -> Path:
    frozen_root = getattr(sys, "_MEIPASS", None)
    return Path(frozen_root) if frozen_root else Path(__file__).resolve().parent.parent


def configure_environment(data_directory: Path) -> None:
    os.umask(0o077)
    data_directory.mkdir(parents=True, exist_ok=True)
    os.environ["STUDIO_DATA"] = str(data_directory)

    bundled_bin = bundle_root() / "bin"
    if bundled_bin.is_dir():
        os.environ["PATH"] = f"{bundled_bin}{os.pathsep}{os.environ.get('PATH', '')}"


@contextmanager
def application_lock(data_directory: Path):
    lock_path = data_directory / "studio.lock"
    with lock_path.open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("Whisper Studio is already running.") from error
        yield


def loopback_socket() -> socket.socket:
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server_socket.bind(("127.0.0.1", 0))
    server_socket.listen(128)
    return server_socket


def wait_until_ready(url: str, server_thread: threading.Thread) -> None:
    deadline = time.monotonic() + STARTUP_TIMEOUT
    while time.monotonic() < deadline:
        if not server_thread.is_alive():
            raise RuntimeError("The local transcription service stopped during startup.")
        try:
            with urllib.request.urlopen(url, timeout=0.5) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(0.1)
    raise RuntimeError("The local transcription service did not start in time.")


def engine_command() -> list[str]:
    if getattr(sys, "frozen", False):
        return [sys.executable, "--engine"]
    return [sys.executable, "-m", "studio.engine"]


def model_command() -> list[str]:
    if getattr(sys, "frozen", False):
        return [sys.executable, "--model-download"]
    return [sys.executable, "-m", "studio.models"]


def run_engine() -> None:
    from studio.engine import main as engine_main

    sys.argv = [sys.argv[0], *sys.argv[2:]]
    engine_main()


def run_model_download() -> None:
    from studio.models import download

    download(*sys.argv[2:])


def finish_window_material(window, clear_color=None) -> None:
    """Apply transparent Cocoa materials without WebKit private APIs."""
    if clear_color is None:
        from AppKit import NSColor

        clear_color = NSColor.clearColor()
    native = window.native
    if native is None:
        return
    native.setOpaque_(False)
    native.setBackgroundColor_(clear_color)
    native.setHasShadow_(True)
    native.setTitlebarAppearsTransparent_(True)
    webview = native.contentView()
    if hasattr(webview, "setUnderPageBackgroundColor_"):
        webview.setUnderPageBackgroundColor_(clear_color)


def run_desktop() -> None:
    import webview

    data_directory = application_data_directory()
    configure_environment(data_directory)

    with application_lock(data_directory), loopback_socket() as server_socket:
        port = server_socket.getsockname()[1]
        url = f"http://127.0.0.1:{port}"
        app = create_app(
            root=data_directory,
            command=engine_command(),
            model_command=model_command(),
        )
        config = uvicorn.Config(
            app,
            host="127.0.0.1",
            port=port,
            workers=1,
            proxy_headers=False,
            access_log=False,
            log_level="warning",
        )
        server = uvicorn.Server(config)
        server_thread = threading.Thread(
            target=server.run,
            kwargs={"sockets": [server_socket]},
            name="whisper-studio-server",
            daemon=True,
        )
        server_thread.start()

        try:
            wait_until_ready(url, server_thread)
            webview.settings["ALLOW_DOWNLOADS"] = True
            window = webview.create_window(
                APP_NAME,
                url,
                js_api=SystemNotifications(),
                width=1240,
                height=820,
                min_size=(900, 640),
                background_color="#f7f4ee",
                vibrancy=True,
                text_select=True,
            )
            window.events.loaded += lambda: finish_window_material(window)
            window.events.closed += lambda: setattr(server, "should_exit", True)
            webview.start(gui="cocoa", debug=os.getenv("STUDIO_DEBUG") == "1")
        finally:
            server.should_exit = True
            server_thread.join(timeout=15)


def main() -> None:
    multiprocessing.freeze_support()
    if len(sys.argv) > 1 and sys.argv[1] == "--engine":
        run_engine()
        return
    if len(sys.argv) > 1 and sys.argv[1] == "--model-download":
        run_model_download()
        return
    run_desktop()


if __name__ == "__main__":
    main()
