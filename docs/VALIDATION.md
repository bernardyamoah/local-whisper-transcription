# Validation and release status

Initial implementation: **0.1.0**, verified locally on September 17, 2026 (macOS, Apple Silicon, Python 3.12, FFmpeg 8.0.1, faster-whisper 1.2.1).

## Completed checks

- **31 backend tests passed.** Real SQLite persistence, actual FFmpeg validation of all ten required containers (MP3, WAV, M4A, AAC, FLAC, OGG, MP4, MOV, MKV, WebM), corrupt/empty/playlist rejection, a deterministic full pipeline, cancellation/retry, restart recovery, retention, retained-source reuse, transactional editing, edit conflicts, original-text preservation, export normalization, ranged playback, managed-path confinement, model catalog/install/delete behavior, active-model protection, settings validation, CSRF/host checks, and signed Access JWT rejection cases.
- **6 Chromium browser tests passed.** Import → complete → edit → reload → search → copy → all three downloads → delete; model search, install progress, reload recovery, verification, and deletion; 1440px, 768px, and 390px layouts without horizontal overflow; axe accessibility scans on upload/settings/editor; keyboard file selection; cancel/retry; undo; save-on-navigation; reduced-motion behavior. No JavaScript exceptions in the main flow.
- **1 optional real-inference test passed.** A locally generated spoken sentence was normalized with FFmpeg, transcribed with the locally downloaded `tiny` model on CPU, and produced nonempty timestamped English segments and MP3 playback. This test does not establish production accuracy or long-recording performance.
- Python lint/format and JavaScript syntax checks passed. Browser screenshots were inspected at desktop and mobile widths. Bundled fonts avoid runtime font-service requests.
- Download regression checks cover partial transfers, verification, failures, reload persistence, and a real local `tiny` download.
- Model inference is launched with Hugging Face offline mode and `local_files_only=True`; model downloads are a separate explicit operation.

The ordinary pytest run skips the optional real-engine test unless existing model/audio paths are supplied. Current upstream Starlette/AnyIO emit test-client deprecation warnings; these do not fail the tests.

## Deployment and manual acceptance still required

These are requirements for declaring **PRD version 1.0 ready**, rather than claims made by this initial repository:

- Provision the owner-only Access policy, remotely managed Tunnel, DNS route, and connector supervision in the owner's Cloudflare account.
- Verify the actual hostname with owner, unrelated, and unauthenticated identities; stop the connector and verify failure behavior.
- Measure memory and elapsed time on a one-hour representative speech recording and compare quality presets.
- Evaluate accented, mixed-language, noisy, musical, and silent recordings; no automatic accuracy guarantee is made.
- Verify CUDA on supported NVIDIA hardware if it will be used. Apple Metal acceleration is not supported by the selected adapter.
- Open subtitle exports in a standard external media player, and conduct a longer manual keyboard/screen-reader review.
- Independently inspect system network traffic during inference and perform a backup/restore rehearsal on the production data directory.

The GitHub workflow repeats backend, format, and browser checks on Ubuntu. Its results should be reviewed for each pushed revision.

## Implementation limits

Remote upload body size is constrained by the Cloudflare plan. Uploads restart rather than resume. Downloads use repository file sizes and transfer callbacks to report bytes and percentage, followed by a separate verification state. Export overlap correction preserves ordering by moving the next cue forward; editor timestamps retain the original engine values. Search highlights matching segments, and next/previous navigation moves between matching segments. The session Undo button restores the last completed segment edit; normal typing undo is also available in the textarea.

A source-only retained recording remains manageable in the Library. Original generated segment text is kept, but a side-by-side original comparison UI is deferred. Safe diagnostics intentionally omit detailed runtime exception strings because those can include private paths or source names. Long audio is written to files, but the underlying inference library can decode normalized audio into memory.
