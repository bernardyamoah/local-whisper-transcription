import os
import plistlib
import sys
from pathlib import Path

from studio import __version__

values = {
    "CFBundleExecutable": "WhisperStudio",
    "CFBundleIdentifier": "com.bernardyamoah.whisperstudio",
    "CFBundleName": "Whisper Studio",
    "CFBundleDisplayName": "Whisper Studio",
    "CFBundlePackageType": "APPL",
    "CFBundleShortVersionString": __version__,
    "CFBundleVersion": __version__,
    "CFBundleIconFile": "WhisperStudio.icns",
    "LSMinimumSystemVersion": "26.0",
    "NSHighResolutionCapable": True,
    "NSAppTransportSecurity": {"NSAllowsLocalNetworking": True},
    "NSMicrophoneUsageDescription": "Use your microphone when you try live transcription or start a meeting.",
    "NSSpeechRecognitionUsageDescription": "Transcribe your meetings live on this Mac.",
    "NSScreenCaptureUsageDescription": "Capture meeting audio playing on your Mac.",
}

# Installed OAuth clients cannot keep credentials confidential. Google requires
# the generated desktop credential during token exchange, so both values are
# injected only while packaging and never committed to source control.
if client_id := os.getenv("GOOGLE_MEET_CLIENT_ID", "").strip():
    values["GoogleMeetClientID"] = client_id
if client_secret := os.getenv("GOOGLE_MEET_CLIENT_SECRET", "").strip():
    values["GoogleMeetClientSecret"] = client_secret

Path(sys.argv[1]).write_bytes(plistlib.dumps(values))
