#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

pyinstaller_config="$(mktemp -d)"
staging=""
trap 'rm -rf "$pyinstaller_config"; [[ -z "$staging" ]] || rm -rf "$staging"' EXIT
export PYINSTALLER_CONFIG_DIR="$pyinstaller_config"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The macOS app must be built on macOS." >&2
  exit 1
fi

for command in uv npm qlmanage sips iconutil xcrun hdiutil; do
  if ! command -v "$command" >/dev/null; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done

if ! xcrun --find lipo >/dev/null 2>&1; then
  echo "The Apple command-line tools are unavailable. Install them and accept the Xcode license with: sudo xcodebuild -license" >&2
  exit 1
fi

ffmpeg_path="${FFMPEG_DIR:-}"
if [[ -z "$ffmpeg_path" ]]; then
  if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
    echo "Install FFmpeg or set FFMPEG_DIR to a directory containing ffmpeg and ffprobe." >&2
    exit 1
  fi
  ffmpeg_path="$(dirname "$(command -v ffmpeg)")"
fi
if [[ ! -x "$ffmpeg_path/ffmpeg" || ! -x "$ffmpeg_path/ffprobe" ]]; then
  echo "FFMPEG_DIR must contain executable ffmpeg and ffprobe files." >&2
  exit 1
fi
export FFMPEG_DIR="$ffmpeg_path"

# Screen recording permission is tied to the app's designated requirement.
# Reuse a stable identity when one is available so local rebuilds remain the same app to macOS.
if [[ -z "${CODESIGN_IDENTITY:-}" ]]; then
  local_identity="$(security find-identity -v -p codesigning | awk '/Whisper Studio Development/ {print $2; exit}')"
  if [[ -n "$local_identity" ]]; then
    export CODESIGN_IDENTITY="$local_identity"
  fi
fi

npm ci
npm run build
uv sync --locked --extra macos --group package
swift build -c release --package-path native
export NATIVE_BRIDGE_PATH="$project_root/native/.build/release/whisper-studio-audio-bridge"

icon_root="$project_root/build/macos"
iconset="$icon_root/WhisperStudio.iconset"
mkdir -p "$iconset"
find "$iconset" -type f -delete
qlmanage -t -s 1024 -o "$icon_root" "$project_root/studio/static/mark.svg" >/dev/null
source_icon="$icon_root/mark.svg.png"
while read -r filename size; do
  sips -z "$size" "$size" "$source_icon" --out "$iconset/$filename" >/dev/null
done <<'EOF'
icon_16x16.png 16
icon_16x16@2x.png 32
icon_32x32.png 32
icon_32x32@2x.png 64
icon_128x128.png 128
icon_128x128@2x.png 256
icon_256x256.png 256
icon_256x256@2x.png 512
icon_512x512.png 512
icon_512x512@2x.png 1024
EOF
iconutil -c icns "$iconset" -o "$icon_root/WhisperStudio.icns"

uv run --extra macos --group package pyinstaller --noconfirm --clean packaging/WhisperStudio.spec

if [[ -n "${CODESIGN_IDENTITY:-}" ]]; then
  codesign --force --deep --sign "$CODESIGN_IDENTITY" \
    --preserve-metadata=identifier \
    "$project_root/dist/Whisper Studio.app"
  codesign --verify --deep --strict "$project_root/dist/Whisper Studio.app"
fi

bundle_kib="$(du -sk "$project_root/dist/Whisper Studio.app" | awk '{print $1}')"
max_bundle_kib=$((450 * 1024))
if (( bundle_kib > max_bundle_kib )); then
  echo "The app bundle is $((bundle_kib / 1024)) MiB; expected at most 450 MiB." >&2
  exit 1
fi

version="$(sed -n 's/^version = "\([^"]*\)"/\1/p' pyproject.toml | head -1)"
architecture="$(uname -m)"
staging="$(mktemp -d)"
cp -R "$project_root/dist/Whisper Studio.app" "$staging/Whisper Studio.app"
ln -s /Applications "$staging/Applications"
dmg="$project_root/dist/Whisper-Studio-$version-$architecture.dmg"
hdiutil create -ov -fs APFS -format UDZO -volname "Whisper Studio" -srcfolder "$staging" "$dmg"
hdiutil verify "$dmg"

echo "Built $project_root/dist/Whisper Studio.app"
echo "Built $dmg"
