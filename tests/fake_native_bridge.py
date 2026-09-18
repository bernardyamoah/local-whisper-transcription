import json
import signal
import sys
import time
import wave


def write(value):
    print(json.dumps(value), flush=True)


if sys.argv[1] == "capabilities":
    write({"type": "capabilities", "recording": True, "speech_analyzer": True, "locales": ["en_US"]})
elif sys.argv[1] == "record":
    stopped = False
    emitted = False
    started = time.time()

    def stop(*_):
        global stopped
        stopped = True

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    write({"type": "recording.started", "path": sys.argv[2]})
    while not stopped:
        if not emitted and time.time() - started > 0.05:
            write(
                {
                    "type": "transcript.final",
                    "source": "Meeting",
                    "start": 0,
                    "end": 1.2,
                    "text": "We should ship the live meeting view.",
                }
            )
            emitted = True
        time.sleep(0.01)
    with wave.open(sys.argv[2], "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(16000)
        file.writeframes(b"\x00\x00" * 16000)
    write({"type": "recording.stopped", "path": sys.argv[2]})
