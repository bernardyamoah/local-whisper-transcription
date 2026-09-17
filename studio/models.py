import fnmatch
import json
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

REQUIRED = ("model.bin", "config.json", "tokenizer.json")
PATTERNS = ("config.json", "preprocessor_config.json", "model.bin", "tokenizer.json", "vocabulary.*")
MODEL_INFO = {
    "tiny": ("Tiny", "~75 MB"),
    "tiny.en": ("Tiny · English", "~75 MB"),
    "base": ("Base", "~150 MB"),
    "base.en": ("Base · English", "~150 MB"),
    "small": ("Small", "~500 MB"),
    "small.en": ("Small · English", "~500 MB"),
    "medium": ("Medium", "~1.5 GB"),
    "medium.en": ("Medium · English", "~1.5 GB"),
    "large-v1": ("Large v1", "~3 GB"),
    "large-v2": ("Large v2", "~3 GB"),
    "large-v3": ("Large v3", "~3 GB"),
    "large": ("Large", "~3 GB"),
    "large-v3-turbo": ("Large v3 Turbo", "~1.6 GB"),
    "turbo": ("Turbo", "~1.6 GB"),
    "distil-small.en": ("Distil Small · English", "~350 MB"),
    "distil-medium.en": ("Distil Medium · English", "~750 MB"),
    "distil-large-v2": ("Distil Large v2 · English", "~1.5 GB"),
    "distil-large-v3": ("Distil Large v3 · English", "~1.5 GB"),
    "distil-large-v3.5": ("Distil Large v3.5 · English", "~1.5 GB"),
}


def write_progress(path, phase, downloaded=0, total=None):
    temporary = path / ".download.json.tmp"
    temporary.write_text(json.dumps({"phase": phase, "downloaded_bytes": downloaded, "total_bytes": total}))
    temporary.replace(path / ".download.json")


class Models:
    def __init__(self, store):
        self.store = store
        self.processes = {}
        self.lock = threading.Lock()

    def path(self, model):
        if model not in MODEL_INFO:
            raise ValueError("Unsupported model")
        return self.store.path("models", model.replace(".", "-dot-"))

    def status(self, model):
        path = self.path(model)
        installed = (path / ".ready").exists() and all((path / f).is_file() for f in REQUIRED)
        process = self.processes.get(model)
        running = process is not None and process.poll() is None
        try:
            progress = json.loads((path / ".download.json").read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            progress = {}
        phase = progress.get("phase", "connecting" if running else "available")
        error = None
        if installed:
            phase = "ready"
        elif not running and (phase in {"connecting", "downloading", "verifying", "failed"} or process):
            phase = "failed"
            error = "Download interrupted. Check your connection and disk space, then retry."
        total = progress.get("total_bytes")
        downloaded = min(progress.get("downloaded_bytes", 0), total) if total else 0
        return {
            "installed": installed,
            "downloading": running and not installed,
            "phase": phase,
            "downloaded_bytes": downloaded,
            "total_bytes": total,
            "progress": 100 if installed else round(downloaded / total * 100, 1) if total else None,
            "error": error,
            "size_bytes": sum(file.stat().st_size for file in path.rglob("*") if file.is_file())
            if path.exists()
            else 0,
        }

    def catalog(self):
        return [
            {"id": model, "name": name, "estimate": estimate} | self.status(model)
            for model, (name, estimate) in MODEL_INFO.items()
        ]

    def install(self, model):
        with self.lock:
            status = self.status(model)
            if status["installed"] or status["downloading"]:
                return status
            path = self.path(model)
            path.mkdir(parents=True, exist_ok=True)
            write_progress(path, "connecting")
            self.processes[model] = subprocess.Popen(
                [sys.executable, "-m", "studio.models", model, str(path)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            return self.status(model)

    def delete(self, model):
        with self.lock:
            status = self.status(model)
            if status["downloading"]:
                raise ValueError("Wait for the download to finish before deleting this model.")
            path = self.path(model)
            if not path.exists():
                raise KeyError(model)
            shutil.rmtree(path)
            self.processes.pop(model, None)
            return {"deleted": True, "model": model}

    def close(self):
        from studio.jobs import Orchestrator

        for process in self.processes.values():
            Orchestrator.terminate(process)


def download(model, target):
    from faster_whisper import WhisperModel
    from faster_whisper.utils import _MODELS
    from huggingface_hub import HfApi, hf_hub_download
    from huggingface_hub.utils import tqdm

    target = Path(target)
    target.mkdir(parents=True, exist_ok=True)
    completed, total = 0, None
    write_progress(target, "connecting")
    try:
        info = HfApi().model_info(_MODELS[model], files_metadata=True)
        files = [f for f in info.siblings if any(fnmatch.fnmatch(f.rfilename, p) for p in PATTERNS)]
        if not all(any(f.rfilename == required for f in files) for required in REQUIRED):
            raise ValueError("Model repository is missing required files")
        total = sum(f.size for f in files)
        write_progress(target, "downloading", completed, total)

        class DownloadProgress(tqdm):
            def __init__(self, *args, **kwargs):
                self.report = kwargs.get("unit") == "B" and not kwargs.get("name", "").endswith(".transfer")
                self.last_write = 0
                super().__init__(*args, **(kwargs | {"disable": True}))

            def update(self, amount=1):
                # tqdm's disabled implementation does not advance n.
                self.n += amount
                if self.report and time.monotonic() - self.last_write >= 0.2:
                    write_progress(target, "downloading", min(completed + self.n, total), total)
                    self.last_write = time.monotonic()

        for file in files:
            hf_hub_download(
                info.id, file.rfilename, revision=info.sha, local_dir=target, tqdm_class=DownloadProgress
            )
            completed += file.size
            write_progress(target, "downloading", completed, total)
        write_progress(target, "verifying", completed, total)
        WhisperModel(str(target), device="cpu", compute_type="int8", local_files_only=True)
        (target / ".ready").write_text(json.dumps({"model": model}))
        write_progress(target, "ready", completed, total)
    except Exception:
        write_progress(target, "failed", completed, total)
        raise


if __name__ == "__main__":
    download(*sys.argv[1:])
