# Whisper Studio

Local audio and video transcription for Apple Silicon. Whisper Studio runs **FFmpeg, MLX Whisper, SQLite, and its web server on your own Mac**. Import recordings, edit transcripts, and export text or subtitles.

The public website lives at `transcribe.bernardyamoah.com`. Transcription runs only inside the installed macOS app.

![Whisper Studio upload workspace](docs/screenshots/studio-desktop.png)

## Start locally

Requirements: macOS or Linux, Python 3.12/3.13 (managed by uv), [uv](https://docs.astral.sh/uv/getting-started/installation/), and FFmpeg. On macOS:

```sh
brew install uv ffmpeg
git clone https://github.com/bernardyamoah/local-whisper-transcription.git
cd local-whisper-transcription
uv sync --locked
uv run whisper-studio
```

Open **http://127.0.0.1:8765**. On a fresh installation, the setup flow opens automatically. Choose a model, explicitly start its download, then save your language and retention preferences. Existing installations open the workspace directly; use **Settings → Run setup** to revisit onboarding. The application never downloads an inference model automatically.

## macOS app

Whisper Studio 0.5 uses a native SwiftUI interface (macOS 15+), with the existing local Python transcription engine bundled as a background service. Your SQLite library, models, and provider settings stay in the same Application Support folder.

Build on a Mac with Xcode / Swift 6.2 or later:

```sh
xcode-select --install
sudo xcodebuild -license
brew install uv ffmpeg
./scripts/build-macos.sh
open "dist/Whisper Studio.app"
```

The build produces `dist/Whisper Studio.app` and a versioned DMG installer. It uses a native Cocoa/WebKit window while retaining the existing local React interface and Python transcription service. A small Swift helper records microphone and meeting audio through ScreenCaptureKit; FFmpeg and FFprobe are copied into the app bundle. Application data is stored in `~/Library/Application Support/Whisper Studio`.

The default build is suitable for local use and ad-hoc signing. For distribution, set `CODESIGN_IDENTITY` to a Developer ID Application certificate before building, then notarize the resulting app with Apple's normal release workflow. Set `FFMPEG_DIR` when packaging known self-contained FFmpeg binaries instead of the copies on `PATH`. Build separately on Apple Silicon and Intel with a matching Python and FFmpeg installation. `MACOS_ARCH` can select an architecture only when the complete build environment already supports it.

First installation requires internet access. After software and a model are installed, local transcription works offline. The installed application does not need Node.js; FastAPI serves the compiled client, CSS, SVGs, and fonts directly.

## Included

- Drag-and-drop uploads with streaming writes, checksums, actual container probing, duration limits, and upload progress.
- Searchable model manager with explicit installation, deletion, measured download progress, and Apple Silicon-optimized MLX checkpoints.
- Quick (`small`), Balanced (`turbo`), and Precise (`large-v3`) presets, optional model override, and automatic or manual language selection.
- One durable background worker; persistent queue, stage progress, elapsed time, cancellation, retry, and interrupted-job recovery.
- Browser-compatible playback with a Rare UI segment transport, timestamp seeking, segment following, volume, and speed controls.
- Optional Google Meet connection that matches recorded utterances to Meet transcript entries and applies participants' display names automatically.
- Debounced autosave, original generated text preservation, revision conflict protection, search, session undo, and copy.
- TXT, SRT, and VTT export from saved edits; ordered, non-overlapping subtitle cues and safe filenames.
- Searchable/sortable, paginated library, retained source reuse, scoped deletion confirmations, and retention settings.
- Local diagnostics, rotating content-free logs, storage reporting, and offline connection messages.
- Loopback-only origin, host/origin checks, CSRF request headers, and a restrictive CSP.
- Self-hosted DM Sans and Newsreader, keyboard controls, reduced-motion support, and desktop/tablet/mobile layouts.
- TanStack Start file-based routes, shadcn form primitives, Rare UI interactions, and restrained Motion transitions.

## Configuration

Copy `.env.example` to `.env` and launch with:

```sh
uv run --env-file .env whisper-studio
```

`STUDIO_DATA` defaults to `~/.local/share/whisper-studio`. It contains the SQLite database, original recordings, MP3 playback derivatives, temporary files, models, and logs. Treat this entire directory as private. No media or models belong in Git.

`STUDIO_PORT` defaults to `8765`. `STUDIO_MODEL_FAST`, `STUDIO_MODEL_BALANCED`, and `STUDIO_MODEL_ACCURATE` default to `small`, `turbo`, and `large-v3`. Model mappings and environment variables require a restart. Supported mappings are `small`, `turbo`, and `large-v3`. Displayed memory and download estimates describe the default mappings.

Language, quality, recording retention, maximum duration, and hardware are saved in the application. Hardware preferences apply to the next job. MLX uses Apple Silicon's unified memory and accelerated compute path. Balanced/Turbo is recommended for the target M2 Pro Mac; Precise/Large V3 may create memory pressure while other demanding applications are open.

Automatic real speaker names require a connected Google account and a transcript generated by Google Meet for the same call. Release builds inject Whisper Studio's OAuth desktop credential with `GOOGLE_MEET_CLIENT_ID` and `GOOGLE_MEET_CLIENT_SECRET`; users connect under **Settings → Connections → Google Meet** without entering developer credentials. Installed clients cannot keep this app credential confidential, so it must never be treated as a user secret. The integration requests only `meetings.space.readonly`; its refresh token remains in the app's private Application Support directory. Google retains structured transcript entries for 30 days.

## Website and download

`https://transcribe.bernardyamoah.com` is a public marketing site hosted with Cloudflare Workers Static Assets. Its **Download for Mac** action streams the versioned DMG from R2. The website never proxies or exposes the local application.

The installed app binds to loopback and prevents multiple instances from sharing a data directory. It does not require Cloudflare Tunnel, Cloudflare Access, or an always-on internet connection.

## Development and verification

```sh
uv sync --locked
uv run ruff check studio tests
uv run ruff format --check studio tests
uv run pytest -q
npm ci
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Backend and browser suites use real SQLite and FFmpeg with a deterministic subprocess engine. The fake engine exists only in the test launcher; there is no production configuration switch that can enable it. Browser tests cover import → processing → edits → reload → copy → exports → deletion, responsive layout, and automated accessibility checks.

For frontend development, one command starts the Python backend and Vite together:

```sh
npm run dev
```

Use `npm run dev:frontend` or `npm run dev:backend` when you need to run either service separately.

For an optional real-engine test, explicitly download a small model and provide a short speech fixture:

```sh
uv run python -m studio.models small .data/integration/small
# macOS example: generate a local, non-sensitive speech fixture.
say -o .data/integration/speech.aiff "Every voice has a story. This recording stays on my computer."
ffmpeg -i .data/integration/speech.aiff .data/integration/speech.wav
STUDIO_TEST_MODEL="$PWD/.data/integration/small" STUDIO_TEST_AUDIO="$PWD/.data/integration/speech.wav" uv run pytest tests/test_real_engine.py -q
```

This optional model download is approximately 500 MB and connects to Hugging Face. Routine CI does not download models.

## Architecture

`src/` contains the TanStack Start SPA, file routes, shadcn form primitives, [Rare UI](https://www.rareui.com/) interactions, and Motion animation. `studio/app.py` exposes the same-origin JSON API and serves the compiled client. The build externalizes TanStack Start's bootstrap code so the strict CSP needs no inline-script exception. `store.py` manages SQLite and confined paths. `media.py` validates imports with FFprobe. `jobs.py` owns all job state transitions and runs one subprocess at a time. `engine.py` isolates FFmpeg and Whisper; cancellation kills the complete process group. `models.py` handles explicit downloads. `exports.py` normalizes subtitle cues. `security.py` verifies the request boundary.

The server polls durable state; inference is independent of browser requests. Every SQLite connection enables foreign keys; write transactions protect edits and transcript creation. Schema version 1 uses `PRAGMA user_version`. A future schema change must add a migration before increasing it. Recordings stream to disk; the Whisper runtime may allocate normalized audio internally, so large-file memory acceptance still needs hardware-specific testing.

See [operations and recovery](docs/OPERATIONS.md), [validation and release status](docs/VALIDATION.md), and the [original PRD](docs/PRD.md).

## Current boundaries

This is an initial implementation, not a claim that every PRD 1.0 acceptance check has been completed. Production Access identity tests, a real Tunnel outage test, one-hour resource measurements, multilingual/noisy-audio quality checks, and CUDA verification require the deployment and target hardware. Remote uploads are subject to Cloudflare's request-size limit; use localhost for larger recordings. Uploads can be retried but do not resume partial transfers. There is no diarization, live transcription, or cloud inference.

Fonts are distributed under the SIL Open Font License; their licenses are bundled in `studio/static/fonts/`.

## Website and guided setup

- **Website:** `http://127.0.0.1:8765/website/` (also available through the frontend dev proxy).
- **Onboarding:** `http://127.0.0.1:8765/welcome`.
- **Standalone website:** `npm run build:website` creates `dist/website/`, ready for a static host. It includes its fonts and assets and makes no requests to the studio API. The local-studio link intentionally points to `127.0.0.1:8765/welcome`; installation instructions link to the source repository rather than a nonexistent binary release.

`npm run build` also bundles the website into the local app. Publishing `dist/website/` does not publish the private transcription API. No public deployment is configured or performed by the build.

Onboarding uses real environment checks and model download progress. It never downloads a model until **Download model** is pressed. Setup progress is retained in the current browser session; completion and preferences are persisted in SQLite. **Set up later** skips setup for the current session. A completed setup, or an existing supported model installation, keeps returning users in the workspace.
