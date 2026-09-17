"""An isolated browser-test server with deterministic inference. Not a deployment entrypoint."""

import sys
import tempfile
import wave
from pathlib import Path

import uvicorn

from studio.app import create_app

root = Path(tempfile.mkdtemp(prefix="studio-browser-tests-"))
app = create_app(root, command=[sys.executable, str(Path(__file__).parent / "fake_engine.py")])
for model in ["base", "small", "medium"]:
    path = app.state.store.path("models", model)
    path.mkdir()
    for file in [".ready", "model.bin", "config.json", "tokenizer.json"]:
        (path / file).write_text("test")
with wave.open(str(root / "fixture.wav"), "wb") as stream:
    stream.setnchannels(1)
    stream.setsampwidth(2)
    stream.setframerate(16000)
    stream.writeframes(b"\x00\x00" * 32000)
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8766, access_log=False)
