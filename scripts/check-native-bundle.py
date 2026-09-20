"""Exercise the frozen engine exactly as the native app does, with an empty library."""
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

bundle = Path(sys.argv[1]).resolve()
engine = bundle / 'Contents/Resources/Engine/Whisper Studio Service'
with tempfile.TemporaryDirectory(prefix='whisper-bundle-check-') as directory:
    root = Path(directory)
    ready = root / 'ready.json'
    with (root / 'engine.log').open('w+') as log:
        process = subprocess.Popen([str(engine), '--ready-file', str(ready)],
            env=os.environ | {'STUDIO_DATA': str(root / 'data')}, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 45
            while not ready.exists() and time.monotonic() < deadline:
                if process.poll() is not None:
                    log.seek(0)
                    raise RuntimeError(log.read())
                time.sleep(.1)
            address = json.loads(ready.read_text())['url']
            with urllib.request.urlopen(address + '/api/environment', timeout=20) as response:
                environment = json.load(response)
            assert environment['database'], 'Database unavailable'
            assert environment['ffmpeg'], 'Bundled FFmpeg did not execute'
            assert environment['ffprobe'], 'Bundled FFprobe is missing'
            assert environment['native']['recording'], 'Native audio helper unavailable'
            assert Path(environment['data_location']).resolve() == (root / 'data').resolve()
            print('Frozen engine, database, FFmpeg, FFprobe and native helper verified.')
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=25)
        assert not ready.exists(), 'Engine did not clean up readiness file'
