#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ -f .env ]; then
  exec uv run --locked --env-file .env whisper-studio
fi
exec uv run --locked whisper-studio
