# Native Whisper Studio

## Design direction

The VoiceOS onboarding reference shared on 19 September 2026 uses a spacious, companion-like introduction with a luminous presence and focused steps. Whisper Studio translates those qualities into a quiet native Mac workspace: system typography, a clay accent, a restrained animated dot field, translucent utility surfaces, and reversible 350 ms critically damped springs. Reduced Motion disables spatial transitions and continuous animation. Reduced Transparency replaces material cards with opaque backgrounds.

The reference was inspected from the linked public video, including frames at 0, 7, 14, 21, and 28 seconds. This is an interpretation, not a copy of VoiceOS branding or its voice assistant.

## Architecture

- `native/Sources/WhisperStudio`: actual SwiftUI application. No WebKit or embedded web UI.
- `studio/service.py`: bundled, headless local engine; owns the existing SQLite database, MLX/Whisper, FFmpeg, Deepgram, JEV, export and destination workflows.
- `native/Sources/AudioBridge`: existing microphone/system-audio capture and live transcription helper.
- `scripts/build-macos.sh`: builds the native application by invoking `build-swiftui.sh`.
- `scripts/build-webview-macos.sh`: retained rollback build for the previous desktop UI.
- The public website remains a website; it is not part of the SwiftUI view hierarchy.

This is a native UI and desktop-host rewrite, not a rewrite of MLX/Whisper inference into Swift. SQLite and Application Support paths remain unchanged. The existing app-wide lock prevents two engines from writing to the same library. The engine binds to a random loopback port, rejects remote access and cross-origin writes, and exits with its parent.

## Feature coverage

| Workflow | Native implementation |
| --- | --- |
| Welcome | Three focused steps, provider and appearance choices, replay from Settings |
| Import | Native file picker, drag and drop, file metadata, local/Deepgram selection, presets, language and templates |
| Recording | Existing native capture helper, live utterances, elapsed time, manual and JEV bookmarks, stop/save |
| Recording away from capture | Floating status control and menu bar controls |
| Library | Search across titles/transcripts/speakers, sorting, pagination, delete transcript or source |
| Transcript | Editable utterances, undo, copy, title and speaker rename, optional Google Meet display-name matching, timestamp seeking |
| Playback | AVPlayer audio controls and video, speed, scrubbing, current utterance, completed-text fade and follow scrolling |
| Search | Matching utterance IDs, highlighting, wraparound next/previous, scroll to result |
| Notes | Summary, chapters, bookmarks, JEV status/error visibility |
| Export | TXT, SRT, VTT, Markdown, PDF, DOCX, CSV, JSON, transcript/media ZIP; minutes/actions; timestamps; native Save dialog |
| Destinations | Obsidian, Notion, webhook settings and explicit Send confirmation |
| Settings | Illustrated appearance, default preferences, provider connections including Google Meet, models, storage, retained sources |
| Lifecycle | Single native window, menu bar, quit guard during recording/import, supervised engine, recovery errors |

## Verification

Run `swift test --package-path native`, then `swift test --package-path native --skip-build --enable-swift-testing` with the installed Swift build system. The second command explicitly executes the tests when the first only builds them.

The optional API integration test uses `STUDIO_TEST_API`; it refuses writes unless the engine data path identifies the isolated `whisper-swiftui-validation` test library. It verifies decoding, transcript editing/undo, and a real Markdown export. No provider calls or recording are needed.

Python lifecycle test: `uv run pytest tests/test_native_service.py -q`.

Local builds preserve the previous `dist` application. No website deployment or remote upload happens as part of the native build.
