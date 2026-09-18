from types import SimpleNamespace

import pytest

from studio.models import Models, download, write_progress
from studio.store import Store


def test_download_reports_transfer_and_verification(tmp_path, monkeypatch):
    import huggingface_hub
    import mlx_whisper.load_models

    store = Store(tmp_path)
    models = Models(store)
    models.processes["small"] = SimpleNamespace(poll=lambda: None)
    path = store.path("models", "small")
    files = [
        SimpleNamespace(rfilename=name, size=size)
        for name, size in [("config.json", 10), ("weights.npz", 90)]
    ]
    info = SimpleNamespace(id="mlx-community/whisper-small-mlx", sha="fixed-revision", siblings=files)
    monkeypatch.setattr(huggingface_hub.HfApi, "model_info", lambda *args, **kwargs: info)
    observed = []

    def transfer(repo, name, *, revision, local_dir, tqdm_class):
        assert revision == "fixed-revision"
        size = next(f.size for f in files if f.rfilename == name)
        with tqdm_class(total=size, unit="B", initial=0) as bar:
            bar.update(size // 2)
            observed.append(models.status("small"))
            bar.update(size - size // 2)
        (local_dir / name).write_bytes(b"x" * size)

    def verify(*args, **kwargs):
        status = models.status("small")
        assert status["phase"] == "verifying"
        assert status["progress"] == 100
        assert not status["installed"]

    monkeypatch.setattr(huggingface_hub, "hf_hub_download", transfer)
    monkeypatch.setattr(mlx_whisper.load_models, "load_model", verify)
    download("small", path)
    assert [s["progress"] for s in observed] == [5, 55]
    assert all(s["total_bytes"] == 100 and s["downloading"] for s in observed)
    assert models.status("small")["installed"]
    assert models.status("small")["phase"] == "ready"


def test_download_failure_and_restart_are_retryable(tmp_path, monkeypatch):
    import huggingface_hub

    models = Models(Store(tmp_path))
    path = models.store.path("models", "small")

    def fail(*args, **kwargs):
        raise ConnectionError("offline")

    monkeypatch.setattr(huggingface_hub.HfApi, "model_info", fail)
    with pytest.raises(ConnectionError):
        download("small", path)
    assert models.status("small")["phase"] == "failed"
    assert not models.status("small")["installed"]
    write_progress(path, "downloading", 40, 100)
    restarted = Models(models.store).status("small")
    assert restarted["phase"] == "failed"
    assert restarted["progress"] == 40
    assert restarted["error"]


def test_connecting_is_indeterminate(tmp_path):
    models = Models(Store(tmp_path))
    models.processes["small"] = SimpleNamespace(poll=lambda: None)
    state = models.status("small")
    assert state["phase"] == "connecting"
    assert state["progress"] is None
    assert state["downloading"]


def test_install_uses_configured_download_command(tmp_path, monkeypatch):
    command = ["/Applications/Whisper Studio", "--model-download"]
    models = Models(Store(tmp_path), command=command)
    observed = []

    def start(args, **kwargs):
        observed.append((args, kwargs))
        return SimpleNamespace(poll=lambda: None)

    monkeypatch.setattr("studio.models.subprocess.Popen", start)

    state = models.install("small")

    assert observed[0][0] == [*command, "small", str(models.path("small"))]
    assert observed[0][1]["start_new_session"] is True
    assert state["downloading"]


def test_catalog_and_delete(tmp_path):
    models = Models(Store(tmp_path))
    path = models.path("small")
    path.mkdir()
    for name in [".ready", "config.json", "weights.npz"]:
        (path / name).write_text("model")
    catalog = {item["id"]: item for item in models.catalog()}
    assert catalog["small"]["installed"]
    assert catalog["small"]["size_bytes"] > 0
    assert "turbo" in catalog
    assert "large-v3" in catalog
    assert models.delete("small") == {"deleted": True, "model": "small"}
    assert not path.exists()
    with pytest.raises(KeyError):
        models.delete("small")
    with pytest.raises(ValueError):
        models.status("unknown")
