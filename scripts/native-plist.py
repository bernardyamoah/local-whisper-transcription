import plistlib
import sys
from pathlib import Path
from studio import __version__

Path(sys.argv[1]).write_bytes(plistlib.dumps({
    "CFBundleExecutable": "WhisperStudio",
    "CFBundleIdentifier": "com.bernardyamoah.whisperstudio",
    "CFBundleName": "Whisper Studio",
    "CFBundleDisplayName": "Whisper Studio",
    "CFBundlePackageType": "APPL",
    "CFBundleShortVersionString": __version__,
    "CFBundleVersion": __version__,
    "CFBundleIconFile": "WhisperStudio.icns",
    "LSMinimumSystemVersion": "15.0",
    "NSHighResolutionCapable": True,
    "NSAppTransportSecurity": {"NSAllowsLocalNetworking": True},
    "NSMicrophoneUsageDescription": "Use your microphone when you try live transcription or start a meeting.",
    "NSSpeechRecognitionUsageDescription": "Transcribe your meetings live on this Mac.",
    "NSScreenCaptureUsageDescription": "Capture meeting audio playing on your Mac.",
}))
