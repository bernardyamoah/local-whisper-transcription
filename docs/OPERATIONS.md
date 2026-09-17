# Operations, backup, and recovery

## Daily use

Start with `uv run whisper-studio` (or `uv run --env-file .env whisper-studio`). Stop gracefully with Ctrl+C or the supervisor's stop command. Active jobs become interrupted and can be retried. Queued jobs remain durable. Closing the browser does not stop work.

The default data directory is `~/.local/share/whisper-studio`:

| Location | Contents |
| --- | --- |
| `studio.sqlite3` | Media metadata, jobs, transitions, settings, original and edited transcript text |
| `sources/` | Imported originals, addressed by generated IDs |
| `playback/` | Browser-compatible MP3 derivatives |
| `temporary/` | Normalized audio and subprocess results; cleaned after a job or restart |
| `models/` | Explicitly installed local models and resumable download cache |
| `logs/` | Rotating logs containing error categories rather than recording contents |

Use the launcher to enforce a single application instance and restrictive permissions. The application does not encrypt SQLite or recordings itself. Use the operating system's disk encryption for at-rest protection, and protect backup destinations accordingly.

## Backup

Stop the application first, including its supervisor so it cannot immediately restart. Copy the **entire data directory**, including SQLite sidecar files if present, originals, playback audio, and models. Do not copy only `studio.sqlite3` from a running application; its WAL may contain committed work. A stopped-directory copy gives one consistent snapshot of database and media.

Example for the default path:

```sh
mkdir -p "$HOME/Backups"
tar -czf "$HOME/Backups/whisper-studio-$(date +%Y%m%d-%H%M%S).tar.gz" -C "$HOME/.local/share" whisper-studio
```

Keep backups off public or shared folders. Test restoration periodically. There is no automatic cloud backup.

## Restore

Stop the app, preserve the existing directory separately, then extract the backup into its original parent. Confirm ownership and directory permissions. Start with the same `STUDIO_DATA`; interrupted jobs offer retry and completed transcripts remain accessible. If you move the directory, update `STUDIO_DATA` and restart. Back up before upgrading the application.

## Common problems

- **FFmpeg unavailable:** Install `ffmpeg` and ensure both `ffmpeg` and `ffprobe` appear in the application's PATH. Service environments often have a different PATH from your terminal.
- **Model unavailable:** Open Settings and explicitly install the required preset. Incomplete downloads are not considered installed. Installation also verifies that faster-whisper can load the model. Downloads may use additional memory for verification.
- **Download interrupted:** Restart the app and click Install again. The underlying Hugging Face download cache can reuse completed files. No retry begins without your action.
- **Slow processing or memory pressure:** Choose Fast, close other heavy applications, and leave the host awake. Apple Silicon uses CPU in this version. CUDA only works with supported NVIDIA dependencies.
- **CUDA unavailable:** Switch hardware to Auto or CPU. Preset and language are fixed for a job; import again to use a different preset.
- **Failure during inference:** Original media stays available. Check free space, model installation, and FFmpeg before retrying. Safe diagnostics omit transcript text and filenames. Logs intentionally record error categories only.
- **Autosave conflict:** Another tab changed the transcript. Copy unsaved text to a safe local location, reload, and reapply the edit. The application preserves the pending text and refuses in-app navigation while saving fails.
- **Playback missing:** Retention may have removed the original and derivative after success. The transcript and exports remain. Deleting a transcript while retaining its original puts that recording in the Library's retained-recordings list.
- **Partial deletion:** File deletion happens before database removal. A filesystem failure leaves the database item visible and reports an error so deletion can be retried. Some selected files may already have been removed. No secure-erasure guarantee is made for SSDs or backups.
- **Database/directory unavailable:** Restore permissions or disk access. If startup cannot open the database, the server fails to start rather than creating a replacement elsewhere. Preserve the directory and restore from a known backup if damaged.
- **Remote upload 413:** Use `http://127.0.0.1:8765` on the host for recordings above the Cloudflare request-size limit.
- **Domain unavailable:** Check host power, internet connectivity, application service, and connector service. Existing pages report connection errors; new visits may receive Cloudflare's offline-origin page.
- **403 at the domain:** Reauthenticate, verify Access audience/team/email configuration, HTTPS forwarding, and public Host preservation. Never solve this by bypassing authentication.

## Upgrade

Stop the app and back up the data directory. Pull the reviewed revision, run `uv sync --locked`, then restart. Keep the previous checkout and backup until a short import/edit/export check passes. The first release uses schema version 1; future incompatible database versions must be migrated explicitly.
