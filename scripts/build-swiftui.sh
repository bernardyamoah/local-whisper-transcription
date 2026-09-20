#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
[[ "$(uname -s)" == Darwin ]] || { echo "Build on macOS." >&2; exit 1; }
export FFMPEG_DIR="${FFMPEG_DIR:-$(dirname "$(command -v ffmpeg)")}"
if [[ -z "${CODESIGN_IDENTITY:-}" ]]; then
  CODESIGN_IDENTITY="$(security find-identity -v -p codesigning | awk '/Whisper Studio Development/ {print $2; exit}')"
  export CODESIGN_IDENTITY
fi
uv sync --locked --extra macos --group package
swift build -c release --package-path native
export NATIVE_BRIDGE_PATH="$project_root/native/.build/release/whisper-studio-audio-bridge"
uv run --extra macos --group package pyinstaller --noconfirm packaging/WhisperStudioService.spec
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
app="$stage/Whisper Studio.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp native/.build/release/WhisperStudio "$app/Contents/MacOS/WhisperStudio"
ditto native/Sources/WhisperStudio/Resources/BrandIcons "$app/Contents/Resources/BrandIcons"
ditto native/Sources/WhisperStudio/Resources/Welcome "$app/Contents/Resources/Welcome"
ditto 'dist/Whisper Studio Service' "$app/Contents/Resources/Engine"
if [[ -f build/macos/WhisperStudio.icns ]]; then
  cp build/macos/WhisperStudio.icns "$app/Contents/Resources/WhisperStudio.icns"
fi
uv run python scripts/native-plist.py "$app/Contents/Info.plist"
# A local development certificate has no Team ID. PyInstaller's hardened helper
# would reject its own Python library despite both carrying that certificate.
# Match the existing local app's signing mode for this embedded executable.
codesign --force --options 0 --sign "${CODESIGN_IDENTITY:--}" "$app/Contents/Resources/Engine/Whisper Studio Service"
for helper in ffmpeg ffprobe whisper-studio-audio-bridge; do
  codesign --force --options 0 --sign "${CODESIGN_IDENTITY:--}" "$app/Contents/Resources/Engine/_internal/bin/$helper"
done
"$app/Contents/Resources/Engine/_internal/bin/ffmpeg" -version >/dev/null
"$app/Contents/Resources/Engine/_internal/bin/ffprobe" -version >/dev/null
codesign --force --deep --sign "${CODESIGN_IDENTITY:--}" "$app"
codesign --verify --deep --strict "$app"
uv run python scripts/check-native-bundle.py "$app"
version="$(uv run python -c 'from studio import __version__; print(__version__)')"
artifact="dist/Whisper-Studio-$version-$(uname -m).dmg"
ln -s /Applications "$stage/Applications"
hdiutil create -volname 'Whisper Studio' -srcfolder "$stage" -ov -format UDZO "$artifact"
hdiutil verify "$artifact"
# Preserve the last bundle until its replacement has built and verified successfully.
if [[ -d 'dist/Whisper Studio.app' ]]; then
  mv 'dist/Whisper Studio.app' "dist/Whisper Studio.previous-$(date +%Y%m%d-%H%M%S).app"
fi
ditto "$app" 'dist/Whisper Studio.app'
echo "Built native SwiftUI app and $artifact"
