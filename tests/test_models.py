from types import SimpleNamespace

import pytest

from studio.models import Models, download, write_progress
from studio.store import Store


def test_download_reports_transfer_and_verification(tmp_path, monkeypatch):
    import faster_whisper
    import huggingface_hub

    store = Store(tmp_path)
    models = Models(store)
    models.processes["tiny"] = SimpleNamespace(poll=lambda: None)
    path = store.path("models", "tiny")
    files = [
        SimpleNamespace(rfilename=name, size=size)
        for name, size in [("config.json", 10), ("model.bin", 80), ("tokenizer.json", 10)]
    ]
    info = SimpleNamespace(id="Systran/faster-whisper-tiny", sha="fixed-revision", siblings=files)
    monkeypatch.setattr(huggingface_hub.HfApi, "model_info", lambda *args, **kwargs: info)
    observed = []

    def transfer(repo, name, *, revision, local_dir, tqdm_class):
        assert revision == "fixed-revision"
        size = next(f.size for f in files if f.rfilename == name)
        with tqdm_class(total=size, unit="B", initial=0) as bar:
            bar.update(size // 2)
            observed.append(models.status("tiny"))
            bar.update(size - size // 2)
        (local_dir / name).write_bytes(b"x" * size)

    def verify(*args, **kwargs):
        status = models.status("tiny")
        assert status["phase"] == "verifying"
        assert status["progress"] == 100
        assert not status["installed"]
        assert kwargs["local_files_only"]

    monkeypatch.setattr(huggingface_hub, "hf_hub_download", transfer)
    monkeypatch.setattr(faster_whisper, "WhisperModel", verify)
    download("tiny", path)
    assert [s["progress"] for s in observed] == [5, 50, 95]
    assert all(s["total_bytes"] == 100 and s["downloading"] for s in observed)
    assert models.status("tiny")["installed"]
    assert models.status("tiny")["phase"] == "ready"


def test_download_failure_and_restart_are_retryable(tmp_path, monkeypatch):
    import huggingface_hub

    models = Models(Store(tmp_path))
    path = models.store.path("models", "tiny")

    def fail(*args, **kwargs):
        raise ConnectionError("offline")

    monkeypatch.setattr(huggingface_hub.HfApi, "model_info", fail)
    with pytest.raises(ConnectionError):
        download("tiny", path)
    assert models.status("tiny")["phase"] == "failed"
    assert not models.status("tiny")["installed"]
    write_progress(path, "downloading", 40, 100)
    restarted = Models(models.store).status("tiny")
    assert restarted["phase"] == "failed"
    assert restarted["progress"] == 40
    assert restarted["error"]


def test_connecting_is_indeterminate(tmp_path):
    models = Models(Store(tmp_path))
    models.processes["tiny"] = SimpleNamespace(poll=lambda: None)
    state = models.status("tiny")
    assert state["phase"] == "connecting"
    assert state["progress"] is None
    assert state["downloading"]


def test_catalog_and_delete(tmp_path):
    models = Models(Store(tmp_path))
    path = models.path("base.en")
    path.mkdir()
    for name in [".ready", "model.bin", "config.json", "tokenizer.json"]:
        (path / name).write_text("model")
    catalog = {item["id"]: item for item in models.catalog()}
    assert catalog["base.en"]["installed"]
    assert catalog["base.en"]["size_bytes"] > 0
    assert "large-v3-turbo" in catalog
    assert models.delete("base.en") == {"deleted": True, "model": "base.en"}
    assert not path.exists()
    with pytest.raises(KeyError):
        models.delete("base.en")
    with pytest.raises(ValueError):
        models.status("unknown")
