import os
import sys
from pathlib import Path

from studio import macos


def test_application_data_directory_uses_macos_location(monkeypatch, tmp_path):
    monkeypatch.delenv("STUDIO_DATA", raising=False)
    monkeypatch.setattr(Path, "home", lambda: tmp_path)

    assert macos.application_data_directory() == tmp_path / "Library/Application Support/Whisper Studio"


def test_configure_environment_adds_bundled_tools(monkeypatch, tmp_path):
    bundle = tmp_path / "bundle"
    (bundle / "bin").mkdir(parents=True)
    data = tmp_path / "data"
    monkeypatch.setattr(macos, "bundle_root", lambda: bundle)
    monkeypatch.setenv("PATH", "/usr/bin")

    previous_umask = os.umask(0o077)
    try:
        macos.configure_environment(data)

        assert os.environ["STUDIO_DATA"] == str(data)
        assert os.environ["PATH"].split(os.pathsep) == [str(bundle / "bin"), "/usr/bin"]
    finally:
        os.umask(previous_umask)


def test_loopback_socket_uses_an_available_local_port():
    with macos.loopback_socket() as server_socket:
        host, port = server_socket.getsockname()

    assert host == "127.0.0.1"
    assert port > 0


def test_save_export_file_uses_download_name_and_avoids_overwrite(tmp_path):
    first = Path(macos.save_export_file("Meeting: notes.txt", "First", tmp_path))
    second = Path(macos.save_export_file("Meeting: notes.txt", "Second", tmp_path))

    assert first.name == "Meeting notes.txt"
    assert first.read_text() == "First"
    assert second.name == "Meeting notes 2.txt"
    assert second.read_text() == "Second"


def test_save_export_file_rejects_unknown_format(tmp_path):
    try:
        macos.save_export_file("Meeting.pdf", "No", tmp_path)
    except ValueError as error:
        assert str(error) == "Choose TXT, SRT, or VTT"
    else:
        raise AssertionError("Unknown export format was accepted")


def test_engine_command_uses_frozen_executable(monkeypatch):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", "/Applications/Whisper Studio")

    assert macos.engine_command() == ["/Applications/Whisper Studio", "--engine"]


def test_model_command_uses_frozen_executable(monkeypatch):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", "/Applications/Whisper Studio")

    assert macos.model_command() == ["/Applications/Whisper Studio", "--model-download"]


def test_main_dispatches_model_download(monkeypatch):
    observed = []
    monkeypatch.setattr(sys, "argv", ["Whisper Studio", "--model-download", "small", "/tmp/model"])
    monkeypatch.setattr(macos, "run_model_download", lambda: observed.append("download"))
    monkeypatch.setattr(macos, "run_desktop", lambda: observed.append("desktop"))

    macos.main()

    assert observed == ["download"]
