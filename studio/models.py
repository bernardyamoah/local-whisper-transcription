import json
import subprocess
import sys
import threading

REQUIRED = ("model.bin", "config.json", "tokenizer.json")


class Models:
    def __init__(self, store):
        self.store = store
        self.processes = {}
        self.lock = threading.Lock()

    def status(self, model):
        path = self.store.path("models", model)
        installed = (path / ".ready").exists() and all((path / f).is_file() for f in REQUIRED)
        process = self.processes.get(model)
        downloading = process is not None and process.poll() is None
        size = sum(p.stat().st_size for p in path.rglob("*") if p.is_file()) if path.exists() else 0
        return {
            "installed": installed,
            "downloading": downloading,
            "downloaded_bytes": size,
            "error": "Download failed. Check internet access and disk space, then retry."
            if process and process.poll() not in (None, 0)
            else None,
        }

    def install(self, model):
        with self.lock:
            status = self.status(model)
            if status["installed"] or status["downloading"]:
                return status
            path = self.store.path("models", model)
            self.processes[model] = subprocess.Popen(
                [sys.executable, "-m", "studio.models", model, str(path)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            return self.status(model)

    def close(self):
        from studio.jobs import Orchestrator

        for process in self.processes.values():
            Orchestrator.terminate(process)


if __name__ == "__main__":
    from pathlib import Path

    from faster_whisper.utils import download_model

    model, target = sys.argv[1:]
    download_model(model, output_dir=target)
    from faster_whisper import WhisperModel

    WhisperModel(target, device="cpu", compute_type="int8", local_files_only=True)
    (Path(target) / ".ready").write_text(json.dumps({"model": model}))
