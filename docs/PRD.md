# Product Requirements Document: Local Whisper Transcription Web App

**Document status:** Draft for implementation  
**Product type:** Personal, local-first web application  
**Primary user:** The application owner  
**Target platform:** Modern desktop and tablet browsers at `transcribe.bernardyamoah.com`  
**Transcription engine:** OpenAI Whisper running locally  
**Current distribution model:** Public marketing website plus a loopback-only installed macOS app  

> The original private-domain design in this document has been superseded. The production hostname now serves only the public marketing website and installer. The installed app handles recordings and transcripts locally; Cloudflare Tunnel and Access are no longer product requirements.
**Last updated:** September 17, 2026

## Problem Statement

The user needs a private and inexpensive way to convert audio and video recordings into editable text. Existing hosted transcription products require subscriptions, charge by usage, or send recordings to third-party servers. The user wants a browser-based experience while keeping recordings, transcripts, and transcription processing on their own computer.

The product must make local transcription approachable. The user should not need to run terminal commands for each recording, manage model parameters, or manually convert media files. The application must accept common media formats, show processing progress, create timestamped transcripts, support correction, and export useful files.

## Goals

1. Transcribe common audio and video files entirely on the user's computer.
2. Keep source recordings and transcripts private by default.
3. Provide a simple browser interface for importing, processing, editing, and exporting transcripts.
4. Produce readable text and subtitle files with reliable timestamps.
5. Recover safely from application restarts and failed transcription jobs.
6. Avoid subscriptions and per-minute transcription fees.
7. Keep installation and maintenance manageable for one user.
8. Provide secure private access at `transcribe.bernardyamoah.com` without exposing the host computer directly to the internet.
9. Make long transcription sessions feel calm and focused through a polished, soft visual interface.

## Success Metrics

The first release succeeds when:

- The user can install and launch the application by following one setup guide.
- At least 95% of supported, valid media files begin processing without manual conversion.
- A completed transcript remains available after restarting the application.
- The user can correct text without losing timestamp information.
- TXT, SRT, and VTT exports open correctly in standard text editors and media players.
- No recording or transcript is stored or processed by a third-party transcription service during normal operation; remote uploads travel through Cloudflare to the user's host computer.
- Unauthorized visitors cannot reach the application through its public hostname.
- The application remains fully usable at 768px viewport width and above, with essential upload and status flows usable on smaller screens.
- Failed jobs display an understandable cause and can be retried.
- A one-hour recording can be processed without exhausting application memory on the target computer.

## Solution

Build a local-first web application whose server and Whisper engine run on the user's computer. A Cloudflare Tunnel publishes that local origin at `transcribe.bernardyamoah.com`, and Cloudflare Access authenticates the owner before traffic reaches it. The user imports a recording, selects a transcription language and quality level, and starts a job. The local server validates the file, extracts normalized audio with FFmpeg, runs a local Whisper model, and stores timestamped transcript segments in a local SQLite database.

The interface presents job progress and then opens an editor synchronized with an audio player. The user can play a recording from any segment, correct the text, search the transcript, and export plain text or subtitles. All application data stays in a user-controlled local data directory.

## Product Principles

- **Local processing:** Media, transcripts, and model inference remain on the host computer; Cloudflare transports encrypted requests but does not perform transcription.
- **One-user simplicity:** No accounts, organizations, invitations, billing, or permission system.
- **Safe persistence:** Completed work survives refreshes, crashes, and restarts.
- **Progressive control:** Defaults should work without configuration, while language and model controls remain available.
- **Clear resource use:** The application explains that larger models are slower and require more memory.
- **Recoverable actions:** Deletion requires confirmation, and processing failures do not destroy the original recording.
- **Quiet craft:** The interface should feel like a focused listening studio, not a technical administration dashboard.

## Assumptions

- The application is intended for one person on one trusted computer.
- The user will access the application through `transcribe.bernardyamoah.com` after Cloudflare Access authentication.
- The host computer must be powered on, connected to the internet, and running both the application and `cloudflared` for remote use.
- Localhost access remains available as a documented recovery path when the tunnel or internet connection is unavailable.
- The computer can run Python, FFmpeg, and a supported Whisper implementation.
- The first release supports recorded files, not live transcription.
- English is the interface language, while transcription can support Whisper's available languages.
- The user accepts slower processing on computers without a supported GPU.
- The application may download a selected Whisper model during setup or first use.

## User Stories

1. As the owner, I want to open the application in my browser, so that I can use transcription without terminal commands.
2. As the owner, I want the application to work without an account, so that setup stays simple.
3. As the owner, I want to import audio by selecting a file, so that I can transcribe existing recordings.
4. As the owner, I want to drag and drop a file, so that importing is quick.
5. As the owner, I want to import common audio formats, so that I do not need to convert recordings manually.
6. As the owner, I want to import common video formats, so that I can transcribe meetings and videos.
7. As the owner, I want invalid files rejected before processing, so that failures are clear and immediate.
8. As the owner, I want to see file name, type, duration, and size before processing, so that I know I selected the right recording.
9. As the owner, I want to rename a transcription, so that I can recognize it later.
10. As the owner, I want automatic language detection, so that most recordings require no setup.
11. As the owner, I want to choose a language manually, so that I can improve accuracy when I know the language.
12. As the owner, I want to choose a quality level, so that I can balance speed, memory use, and accuracy.
13. As the owner, I want the application to recommend a model, so that I do not need to understand Whisper model sizes.
14. As the owner, I want to see whether the selected model is installed, so that I understand whether a download is required.
15. As the owner, I want to see model download progress, so that I know the application is working.
16. As the owner, I want to start transcription with one action, so that the workflow remains simple.
17. As the owner, I want to see queued, preparing, transcribing, saving, completed, and failed states, so that I understand each job's status.
18. As the owner, I want progress and elapsed time displayed, so that I can estimate how long a job is taking.
19. As the owner, I want processing to continue if I close or refresh the browser tab, so that the job is not tied to the page.
20. As the owner, I want only one heavy transcription job to run by default, so that my computer stays responsive.
21. As the owner, I want additional files queued, so that I can prepare several recordings.
22. As the owner, I want to cancel a queued or running job, so that I can stop unwanted processing.
23. As the owner, I want to retry a failed or cancelled job, so that I do not need to import the file again.
24. As the owner, I want a useful error message, so that I can resolve missing codecs, insufficient storage, or model problems.
25. As the owner, I want completed jobs saved automatically, so that I do not lose work.
26. As the owner, I want to see timestamped transcript segments, so that I can locate speech in the recording.
27. As the owner, I want an audio player beside the transcript, so that I can verify the generated text.
28. As the owner, I want to click a timestamp to seek the player, so that corrections are fast.
29. As the owner, I want the active transcript segment highlighted during playback, so that I can follow the recording.
30. As the owner, I want to pause, seek, and change playback speed, so that I can review difficult passages.
31. As the owner, I want to edit segment text, so that I can correct recognition errors.
32. As the owner, I want edits saved automatically, so that I do not lose corrections.
33. As the owner, I want an indication that edits have been saved, so that persistence is visible.
34. As the owner, I want to undo recent text edits during the current editing session, so that mistakes are reversible.
35. As the owner, I want to search transcript text, so that I can find names and topics.
36. As the owner, I want search results highlighted, so that matches are easy to scan.
37. As the owner, I want to copy the full transcript, so that I can paste it into another application.
38. As the owner, I want to export plain text, so that I can use the transcript in documents.
39. As the owner, I want to export SRT subtitles, so that I can add captions to video.
40. As the owner, I want to export VTT subtitles, so that I can use captions on the web.
41. As the owner, I want exports to use my corrected text, so that fixes appear in downloaded files.
42. As the owner, I want to browse previous transcriptions, so that I can reopen past work.
43. As the owner, I want to sort history by date, name, duration, and status, so that I can locate a job.
44. As the owner, I want to search history by title or file name, so that a growing library stays usable.
45. As the owner, I want to see whether the original recording still exists, so that I understand what can be replayed.
46. As the owner, I want to delete a transcript while optionally retaining its source recording, so that I control local storage.
47. As the owner, I want to delete both a transcript and its recording, so that sensitive material can be removed.
48. As the owner, I want deletion confirmed, so that I do not remove work accidentally.
49. As the owner, I want to see how much storage the application uses, so that I can manage disk space.
50. As the owner, I want to choose whether original recordings are retained after transcription, so that I can favor convenience or storage savings.
51. As the owner, I want temporary conversion files removed automatically, so that storage is not wasted.
52. As the owner, I want application diagnostics that hide transcript contents, so that troubleshooting does not expose private recordings.
53. As the owner, I want to see the installed application, FFmpeg, and Whisper versions, so that troubleshooting is easier.
54. As the owner, I want to see whether CPU or GPU processing is active, so that I understand performance.
55. As the owner, I want a privacy statement inside the application, so that I can verify that normal transcription is local.
56. As the owner, I want the local origin hidden behind an authenticated tunnel, so that other people cannot access my files.
57. As the owner, I want the interface to remain usable on a small laptop screen, so that I can work from different computers.
58. As the owner, I want keyboard-accessible controls, so that I can edit efficiently.
59. As the owner, I want a setup check on first launch, so that missing dependencies are caught early.
60. As the owner, I want a clear recovery path if the database or media directory becomes unavailable, so that the application fails safely.
61. As the owner, I want to open `transcribe.bernardyamoah.com` from my own devices, so that I can use the app without remembering a local port.
62. As the owner, I want Cloudflare to authenticate me before the application loads, so that the public hostname remains private.
63. As the owner, I want unauthorized visitors rejected before they reach my computer, so that the local server has a smaller attack surface.
64. As the owner, I want the interface to explain when the local host is offline, so that a connectivity problem is not mistaken for lost data.
65. As the owner, I want a beautiful upload experience with contextual illustrations, so that starting a transcription feels approachable.
66. As the owner, I want progress visuals based on sound and time, so that waiting feels informative rather than mechanical.
67. As the owner, I want reduced-motion support, so that visual polish does not make the interface uncomfortable.

## Functional Requirements

### FR-1: Application startup

- The application shall run as a local origin and bind only to a configured loopback or private interface.
- The production hostname shall be `transcribe.bernardyamoah.com`.
- A Cloudflare Tunnel connector on the host computer shall route the production hostname to the local origin without inbound router port forwarding.
- Cloudflare Access shall protect every application route with a default-deny policy that permits only the owner's verified identity.
- The application shall provide a local browser URL as an offline and recovery route.
- The application shall show a setup screen when required dependencies are unavailable.
- The setup check shall verify FFmpeg, the transcription runtime, the data directory, available disk space, and at least one usable model.

### FR-2: Media import

- The application shall support file selection and drag-and-drop import.
- The MVP shall accept MP3, WAV, M4A, AAC, FLAC, OGG, MP4, MOV, MKV, and WebM when FFmpeg can decode them.
- The server shall verify the actual media container or stream and shall not trust the file extension alone.
- The application shall reject empty, unreadable, encrypted, or unsupported files with a specific explanation.
- The application shall extract duration, file size, media type, and basic codec information.
- The application shall copy imported media into its managed data directory before processing.
- The default maximum duration shall be four hours per file and shall be configurable.

### FR-3: Transcription configuration

- The user shall select automatic language detection or a supported language.
- The user shall select a quality preset: Fast, Balanced, or Accurate.
- Presets shall map to local Whisper models through configuration rather than hard-coded interface logic.
- The application shall show an approximate memory requirement and relative speed for each preset.
- The application shall prevent a job from starting when the selected model is unavailable and cannot be installed.

### FR-4: Job processing

- The server shall persist a job before processing starts.
- The pipeline shall normalize media to a Whisper-compatible audio stream with FFmpeg.
- The pipeline shall run inference locally and capture segment start time, end time, text, detected language, and confidence data when available.
- Jobs shall execute outside the browser request lifecycle.
- The default worker concurrency shall be one.
- The application shall report stage-based progress even when exact inference progress is unavailable.
- Cancellation shall stop downstream processing and remove temporary files.
- A failed job shall preserve its source media and diagnostic error.
- On restart, interrupted jobs shall move to a recoverable state and offer retry.

### FR-5: Transcript editor

- The editor shall display segments in chronological order.
- Each segment shall show a start timestamp and editable text.
- Selecting a timestamp shall seek the media player to that segment.
- The active segment shall follow playback when synchronization is enabled.
- Text edits shall autosave after a short debounce and on editor navigation.
- Saving shall update the editable transcript while retaining the original generated text for recovery and comparison.
- The editor shall support full-text search and next/previous result navigation.
- The editor shall support copying the complete edited transcript.

### FR-6: Media playback

- The application shall provide play, pause, seek, volume, and playback-speed controls.
- Playback speeds shall include at least 0.75×, 1×, 1.25×, 1.5×, and 2×.
- The player shall use the locally stored source or a browser-compatible derivative.
- Media access shall be limited to application-managed files and shall reject arbitrary filesystem paths.

### FR-7: History

- The history view shall show title, source file name, duration, created date, status, language, and selected preset.
- The user shall search history by title or source file name.
- The user shall sort history by newest, oldest, title, duration, or status.
- Selecting a completed item shall open its transcript.
- Selecting an incomplete item shall open its status and available actions.

### FR-8: Export

- The MVP shall export edited transcript content as TXT, SRT, and VTT.
- TXT shall use readable paragraph separation and optional timestamps.
- SRT and VTT shall use valid, ordered, non-overlapping cues.
- Export generation shall read current saved edits.
- Exported filenames shall derive from the transcript title and use filesystem-safe characters.

### FR-9: Deletion and retention

- The user shall delete a transcript only or delete the transcript and managed source media.
- Destructive actions shall identify exactly what will be deleted and require confirmation.
- Temporary normalized audio shall be deleted after success, cancellation, or failure unless diagnostic retention is enabled.
- A setting shall control whether source media is retained after successful transcription.
- Database deletion and file deletion shall handle partial failure without leaving the interface in a false success state.

### FR-10: Settings and diagnostics

- Settings shall include default language, quality preset, source retention, maximum duration, data location display, and hardware preference.
- Diagnostics shall report application version, FFmpeg availability, transcription runtime version, installed models, compute backend, database status, and storage use.
- Diagnostic exports shall exclude transcript text, filenames, and media contents by default.
- Settings that require restart shall be labeled clearly.
- Diagnostics shall show local origin health, tunnel reachability, and whether the current request passed the expected Cloudflare Access boundary.

### FR-11: Private domain access

- Requests arriving through the production hostname shall use HTTPS.
- Direct public access to the local origin shall not be required.
- Access session duration shall be finite and configurable through Cloudflare Access.
- The authentication policy shall identify the owner by a verified email address or an existing configured identity provider.
- The application shall reject production-host requests that bypass the expected authenticated proxy boundary.
- Upload failures caused by a stopped host, stopped connector, expired Access session, or interrupted network shall be distinguishable where the browser can determine the cause.
- Cloudflare request or authentication logs shall not intentionally include uploaded media bodies or transcript contents.

## Visual and Interaction Design

### Design direction

The product shall use a **soft editorial listening-studio** aesthetic: warm, composed, tactile, and personal. It should feel closer to a beautifully designed field recorder and notebook than to a generic SaaS dashboard. Soft UI means gentle depth and rounded surfaces, not low-contrast neumorphism. Controls must remain legible and accessible.

The memorable visual motif shall be a continuous **sound ribbon**: a hand-shaped waveform line that moves through illustrations, progress states, empty states, and playback. This provides continuity without filling every screen with decorative graphics.

### Color system

- Use a warm paper background rather than pure white.
- Use deep ink for primary text and controls.
- Use muted eucalyptus as the primary accent and active-state color.
- Use soft apricot for highlights, processing states, and illustration details.
- Use mist blue sparingly for timestamps and playback context.
- Reserve red for destructive actions and errors.
- Define all colors as semantic design tokens with light and optional dark values.
- Every text and interactive color combination shall meet WCAG AA contrast requirements.

Suggested initial palette:

- Paper: `#F7F4EE`
- Surface: `#FFFDF8`
- Ink: `#202421`
- Muted ink: `#6D746E`
- Eucalyptus: `#5F7D6E`
- Pale eucalyptus: `#DCE7DF`
- Apricot: `#E9A978`
- Pale apricot: `#F6E1D1`
- Mist: `#C9DCE1`
- Danger: `#B6574F`

### Typography

- Use a warm editorial serif for large titles and milestone numbers.
- Use a highly legible humanist sans-serif for navigation, body text, controls, timestamps, and transcript editing.
- Self-host font files so the application does not depend on a third-party font request and remains visually complete during internet outages.
- Maintain comfortable transcript line length and generous line height for long editing sessions.
- Use tabular numerals for timestamps, durations, file sizes, and progress values.

### Illustration system

- Use original lightweight SVG illustrations built from soft geometric shapes, waveform lines, listening devices, folders, and abstract speech fragments.
- The upload empty state shall feature a calm “sound becoming text” illustration.
- Processing shall animate the sound ribbon through simple stages: listening, interpreting, and writing.
- History empty states and recoverable errors shall receive small contextual spot illustrations.
- Illustrations shall not contain essential instructions or status information.
- SVG assets shall be bundled with the app, optimized, and compatible with high-contrast presentation.
- Avoid stock photography, generic AI brain imagery, robots, microphone clip art, and decorative gradients without functional purpose.

### Surfaces and layout

- Use large, softly rounded panels with restrained borders and layered shadows.
- Keep the main workspace on a calm editorial grid with generous negative space.
- Make the upload area a tactile focal surface rather than a standard dashed rectangle.
- Use a compact left rail or top navigation depending on viewport width; the transcript and player should receive most screen space.
- On the transcript screen, use a persistent player and a reading column, with timestamps set into a quiet side gutter.
- Use cards only when they express a real grouped object or action; avoid wrapping every value in a card.

### Motion

- Use a single composed entrance sequence on initial load and restrained motion afterward.
- Animate job-stage changes, waveform progress, autosave confirmation, and segment focus with short, calm transitions.
- Never use continuous decorative motion while the user is editing text.
- Honor `prefers-reduced-motion` and replace movement with opacity or immediate state changes.
- Motion shall not delay primary actions or obscure system status.

### Core component set

- Private-app shell and authenticated identity menu
- Illustrated drop zone and file preview
- Language selector and three-option quality control
- Sound-ribbon progress indicator
- Durable job-status row
- Synchronized media player with waveform or segment track
- Timestamp gutter and transcript segment editor
- Search and export command bar
- History list with quiet status chips
- Confirmation sheet for destructive actions
- Model download and environment setup panel
- Offline-origin and tunnel-unavailable state
- Toast or inline save-state indicator

## Non-Functional Requirements

### Privacy

- Whisper inference shall make no external model or transcription request.
- When the production domain is used, encrypted application traffic passes through Cloudflare Tunnel and Access; recordings and transcripts are not sent to a transcription provider.
- The application shall not include telemetry, advertising, remote analytics, or crash uploads in the MVP.
- Model downloads shall occur only after an explicit user action or setup confirmation.
- The application shall state when a requested operation requires internet access.

### Security

- The origin shall listen only on loopback or a deliberately configured private interface.
- Cloudflare Access shall enforce authentication before requests reach the origin.
- The Tunnel connector shall make outbound connections only; the deployment shall not open a public inbound port on the host computer or router.
- File paths received from the browser shall never be used directly for filesystem access.
- Imported filenames shall be sanitized, while display names may preserve the original name in the database.
- Media endpoints shall only serve records known to the database.
- The application shall set a conservative content security policy.
- The application shall escape transcript text when rendering it.

### Performance

- Import and navigation shall remain responsive while a transcription runs.
- Media processing shall stream or use files rather than loading an entire long recording into application memory.
- The user interface should become interactive within three seconds after local startup, excluding first-time setup.
- History searches over 1,000 transcripts should return within one second on the target computer.
- Autosave should confirm persistence within two seconds under normal local conditions.

### Reliability

- SQLite transactions shall protect job, transcript, and segment consistency.
- Writes shall use stable identifiers rather than source filenames.
- Temporary files shall use a dedicated application directory.
- A crash during inference shall not corrupt completed transcripts.
- The application shall log technical errors locally with size-based log rotation.
- The database shall support a documented backup and restore procedure.

### Accessibility and usability

- All primary actions shall be keyboard accessible.
- Form controls shall have visible labels.
- Status shall not rely on color alone.
- Focus indicators shall remain visible.
- The complete editing layout shall work at widths down to 768 pixels; upload, job monitoring, playback, and history shall remain usable on narrower mobile screens.
- Error messages shall state what happened and what the user can do next.
- Illustrations shall be decorative or have concise alternative text when they communicate context.
- The interface shall support reduced motion, 200% text zoom, and visible keyboard focus.

## Information Architecture

The application shall contain five primary views:

1. **New Transcription:** Import media, review file details, select language and quality, and start processing.
2. **Jobs:** View queued and active work, progress, errors, cancellation, and retry actions.
3. **Transcript:** Play media, navigate timestamps, edit segments, search text, and export results.
4. **History:** Browse, search, sort, reopen, and delete previous transcriptions.
5. **Settings:** Manage defaults, models, retention, storage, and diagnostics.

Cloudflare Access supplies the authentication screen before these application views. The app itself does not implement a second account system for the MVP.

## Primary User Flows

### First launch

1. User starts the application.
2. System checks dependencies and writable storage.
3. System recommends a quality preset based on available hardware.
4. User approves installation or download of the selected local model when needed.
5. System verifies the model and opens New Transcription.

### Authenticated remote access

1. User opens `transcribe.bernardyamoah.com`.
2. Cloudflare Access checks the current session and prompts for identity verification when required.
3. An authorized request travels through Cloudflare Tunnel to the local origin.
4. The app opens the requested view and performs processing on the host computer.
5. If the host or connector is offline, the user sees an origin-unavailable state and can use the documented localhost recovery route from the host computer.

### Successful transcription

1. User selects or drops a media file.
2. System validates the file and displays its metadata.
3. User accepts automatic language detection and the default preset.
4. User starts transcription.
5. System copies the source, creates a job, normalizes audio, and runs Whisper.
6. Interface displays progress.
7. System stores generated segments and marks the job complete.
8. Transcript editor opens.
9. User reviews, edits, and exports the transcript.

### Failure and retry

1. A pipeline stage fails.
2. System records the stage, safe diagnostic details, and retry eligibility.
3. Interface displays a plain-language error and suggested action.
4. User retries the existing job after correcting the issue.
5. System removes stale temporary output and restarts the pipeline safely.

### Delete sensitive work

1. User selects Delete from the transcript or history view.
2. System offers transcript-only deletion or transcript-and-media deletion.
3. User confirms the exact scope.
4. System removes the selected records and files.
5. Interface reports success or identifies any item that could not be removed.

## Implementation Decisions

### Application architecture

- Use a private-domain, local-origin architecture with a browser client, Cloudflare Access, Cloudflare Tunnel, local application server, background worker, SQLite database, and managed filesystem storage.
- Route `transcribe.bernardyamoah.com` through a remotely managed Cloudflare Tunnel to the local origin.
- Use a self-hosted Cloudflare Access application with a default-deny reusable policy allowing only the owner's verified identity.
- Keep Cloudflare responsible for DNS, TLS termination, identity enforcement, and encrypted transport to the connector; keep all application data, media, database state, and inference on the local host.
- Keep the server and worker in one distributable application for the MVP, while separating their internal modules.
- Run Whisper through a Python transcription service or process boundary because the mature local ecosystem is Python-based.
- Use FFmpeg for media probing, audio extraction, and normalization.
- Use SQLite for transcripts, segments, settings, and durable job state.
- Store source and temporary media on disk; do not store media blobs in SQLite.
- Communicate job status through polling in the MVP. The contract should allow later replacement with server-sent events.
- Retain a localhost recovery route, while treating authenticated access through the production hostname as the normal experience.

### Quality presets

- Provide user-facing presets instead of exposing every Whisper parameter.
- Default mappings should be configurable. A reasonable starting point is `tiny` or `base` for Fast, `small` for Balanced, and `medium` for Accurate.
- Select CPU, CUDA, or Apple acceleration automatically when supported by the chosen runtime.
- Prefer a maintained optimized Whisper implementation when it offers equivalent local behavior and timestamp output; isolate it behind the transcription-engine interface.

### Deep modules

1. **Media Intake:** Validates imports, probes metadata, assigns storage identifiers, and creates safe managed copies through a small import interface.
2. **Transcription Engine:** Accepts a normalized media reference and transcription options, then emits timestamped segments independent of a particular Whisper runtime.
3. **Job Orchestrator:** Owns durable state transitions, concurrency, cancellation, retry, restart recovery, and progress reporting.
4. **Transcript Repository:** Provides transactional creation, reading, editing, searching, and deletion of transcripts and segments.
5. **Export Engine:** Converts a canonical transcript into TXT, SRT, and VTT without depending on interface state.
6. **Storage Manager:** Resolves safe internal paths, tracks storage use, applies retention rules, and removes temporary or deleted files.
7. **Environment Inspector:** Reports dependencies, model availability, compute backend, versions, and actionable setup problems.

### Canonical job states

- `queued`
- `preparing`
- `transcribing`
- `saving`
- `completed`
- `cancelling`
- `cancelled`
- `failed`
- `interrupted`

Only the Job Orchestrator may change job state. Every transition shall be validated and timestamped.

### Data model

**Media asset**

- Stable identifier
- Original display name
- Managed storage name
- MIME type and container
- Size in bytes
- Duration in milliseconds
- Import date
- Retention state
- Content checksum when practical

**Transcription job**

- Stable identifier
- Media asset identifier
- State and current stage
- Requested and detected language
- Quality preset and model identifier
- Compute backend
- Progress value or indeterminate flag
- Creation, start, completion, and update times
- Safe user-facing error and detailed local diagnostic reference
- Cancellation request time
- Attempt count

**Transcript**

- Stable identifier
- Job identifier
- Title
- Detected language
- Creation and modification times
- Engine and model version
- Full-text search index or derived searchable text

**Transcript segment**

- Stable identifier
- Transcript identifier
- Sequence number
- Start and end time in milliseconds
- Original generated text
- Current edited text
- Confidence or probability fields when available
- Last edit time

**Application setting**

- Key
- Typed value
- Last update time

### Local API contracts

- Environment status: return dependency, model, compute, database, and storage health.
- Media import: accept one file, validate it, store it, and return its metadata record.
- Job creation: accept media identifier, language mode, and quality preset; return a persisted job.
- Job listing and detail: return state, stage, progress, timestamps, and safe error information.
- Job control: cancel or retry an eligible job.
- Transcript detail: return metadata and ordered segments.
- Transcript editing: update one or more segment texts with conflict protection based on revision or update time.
- Transcript search: return matching segments and offsets.
- Transcript export: return a generated TXT, SRT, or VTT file.
- History: return paginated and sortable transcript/job summaries.
- Deletion: accept an explicit deletion scope and return per-resource results.
- Settings: read and update validated user settings.

### Error categories

- Unsupported or corrupt media
- Missing FFmpeg
- Missing or invalid model
- Insufficient disk space
- Insufficient memory
- Transcription runtime failure
- Database failure
- File permission failure
- Cancellation
- Unexpected interruption

User-facing errors shall avoid stack traces. Local logs may include technical details but should avoid transcript contents.

## Acceptance Criteria

### Import and processing

- Given a valid supported file, when the user imports it, then the application displays correct basic metadata and enables transcription.
- Given an unsupported or corrupt file, when the user imports it, then the application rejects it without creating a runnable job and explains why.
- Given a valid file and installed model, when the user starts transcription, then a durable job is created before inference begins.
- Given an active job, when the browser refreshes, then the current job and its latest status remain visible.
- Given an application restart during processing, when the app launches, then the job is marked interrupted and can be retried.
- Given a cancelled job, when cancellation completes, then temporary files are removed and the source remains available for retry.

### Transcript editing

- Given a completed job, when the transcript opens, then all saved segments appear in chronological order.
- Given a segment timestamp, when the user selects it, then playback seeks to the associated position.
- Given an edited segment, when autosave completes and the page reloads, then the edited text remains.
- Given a search query, when matches exist, then the user can move through all matching segments.

### Export

- Given an edited transcript, when the user exports TXT, SRT, or VTT, then the export contains the latest saved edits.
- Given SRT or VTT export, then cues are ordered, timestamps are valid, and end times do not precede start times.
- Given a title containing unsafe filename characters, when exporting, then the generated filename is safe and recognizable.

### Privacy and deletion

- Given normal transcription, when network activity is monitored, then no audio is sent to a third-party transcription API; remote browser traffic is limited to the authenticated Cloudflare path and required static application requests.
- Given model installation, when a download is required, then the application asks for confirmation and identifies the model and approximate size.
- Given transcript-and-media deletion, when deletion succeeds, then the database records, managed source, derivatives, and temporary files are unavailable.

### Domain access and visual quality

- Given an unauthorized or unauthenticated visitor, when they open the production hostname, then Cloudflare Access blocks or challenges them before the origin application loads.
- Given an authorized user and a healthy connector, when they open the production hostname, then the application loads over HTTPS and reaches the local origin.
- Given the host computer or Tunnel connector is offline, when the user opens the domain, then no private application data is exposed and the failure is distinguishable from an application-level transcription error.
- Given any primary view, then typography, spacing, surfaces, and illustration treatment follow the defined design tokens and listening-studio direction.
- Given reduced motion is enabled, then all primary functions remain usable without continuous or large animated movement.
- Given keyboard-only navigation, then the user can import a file, start a job, navigate status, edit transcript text, and export a result.

## Testing Decisions

Tests shall verify externally observable behavior through public module interfaces. Tests should avoid assertions about private functions, internal call order, or a specific Whisper library unless that behavior is part of an adapter contract. Media and model fixtures should remain small enough for routine execution.

### Unit tests

- Test legal and illegal Job Orchestrator state transitions.
- Test cancellation, retry eligibility, and interrupted-job recovery.
- Test Media Intake validation and safe filename handling.
- Test Storage Manager path confinement and retention rules.
- Test transcript segment validation and edit persistence.
- Test Export Engine output against valid TXT, SRT, and VTT examples.
- Test time formatting, cue ordering, and overlap correction rules.
- Test settings validation and preset resolution.

### Integration tests

- Use a short, known audio fixture to test FFmpeg probing and normalization.
- Run a lightweight local model in an optional integration suite to validate the Transcription Engine adapter.
- Test the full job pipeline with a fake deterministic transcription engine during normal automated runs.
- Test database transactions, restart recovery, deletion, and migrations against a temporary SQLite database.
- Test that imported and generated files remain inside a temporary managed data directory.
- Test API validation, error mapping, and edit-conflict handling.

### End-to-end tests

- Import a sample, create a job, observe completion, edit a segment, reload, and export all formats.
- Cancel an active fake job and retry it.
- Restart the application with an in-progress job and confirm recovery.
- Delete transcript-only and transcript-with-media records.
- Navigate primary flows using a keyboard.
- Verify authenticated access through the production hostname and denial for an unauthorized identity.
- Stop the Tunnel connector and verify the expected unavailable-origin behavior without data leakage.
- Capture key screens at desktop, tablet, and mobile widths for visual regression checks.

### Manual quality checks

- Test clear speech, background noise, music, silence, multiple accents, and mixed-language audio.
- Test short and long recordings on the actual target computer.
- Compare Fast, Balanced, and Accurate presets for speed, memory use, and accuracy.
- Verify CPU and any available GPU acceleration.
- Open SRT and VTT exports in at least one standard media player.
- Confirm through system network monitoring that transcription remains local.

No prior application tests exist because this is a greenfield project. The implementation shall establish reusable fixtures for media, transcript segments, and job states from the start.

## Delivery Plan

### Phase 1: Foundation

- Local server and browser interface
- Environment and dependency checks
- SQLite schema and migrations
- Managed data directories
- Media import and FFmpeg probing
- Basic job state model
- Design tokens, typography, application shell, and initial SVG illustration system

### Phase 2: Transcription pipeline

- Whisper engine adapter
- Quality presets and model management
- Background worker
- Progress, cancellation, retry, and restart recovery
- Transcript and segment persistence

### Phase 3: Review and export

- Transcript editor
- Synchronized media player
- Autosave and search
- TXT, SRT, and VTT export
- History, sorting, and filtering

### Phase 4: Privacy, maintenance, and release

- Cloudflare DNS record, remotely managed Tunnel, and connector service
- Cloudflare Access application and owner-only reusable allow policy
- Production hostname, HTTPS, origin-binding, and offline-origin validation
- Retention and deletion controls
- Diagnostics and storage reporting
- Accessibility pass
- Performance and long-recording tests
- Installation guide, backup guide, and troubleshooting documentation
- Packaged local release or one-command launcher

## Risks and Mitigations

- **Slow CPU transcription:** Recommend a smaller default model, show realistic preset tradeoffs, and support hardware acceleration when available.
- **High model memory use:** Estimate requirements before starting and fail with a specific recommendation rather than allowing an unexplained crash.
- **Large model downloads:** Require confirmation, show progress, verify completion, and support resuming or clean retry where the model source permits it.
- **Long recordings consuming disk space:** Remove temporary files reliably and display storage use and retention settings.
- **Inaccurate timestamps:** Preserve the engine's segment boundaries, validate ordering, and keep export logic independent and testable.
- **Application interruption:** Persist jobs before work, use atomic writes where possible, and recover incomplete states at startup.
- **Local server exposed accidentally:** Bind the origin to loopback or a deliberate private interface and require the authenticated Tunnel path for production use.
- **Tunnel hostname is public:** Place Cloudflare Access in front of every route with default-deny behavior and verify unauthorized access before launch.
- **Host or connector goes offline:** Run the application and connector as supervised services, show a clear unavailable-origin state, and preserve localhost recovery.
- **Large uploads over a remote connection fail:** Use retryable uploads where practical, preserve files only after server confirmation, and explain that uploads still travel back to the host computer.
- **Soft UI reduces clarity:** Preserve strong contrast, visible boundaries, keyboard focus, and explicit status text; treat shadows and illustration as enhancement rather than information.
- **Whisper runtime differences:** Hide the chosen implementation behind a stable engine interface and store the engine and model versions with each transcript.
- **Sensitive material left on disk:** Make retention explicit, offer complete deletion, and document backups and filesystem encryption considerations.

## Out of Scope

- User accounts, passwords, and multi-user access
- Cloud storage or synchronization
- Hosted deployment
- Payments, subscriptions, usage quotas, or billing
- Live microphone transcription
- Real-time captions
- Speaker diarization or automatic speaker naming
- Collaborative editing and comments
- Mobile-native applications
- Automatic summaries, chapters, action items, or question answering
- Translation into another language
- Automatic cloud backup
- Email or push notifications
- Public or anonymous access
- Multi-user identity policies
- OCR or image transcription
- Guaranteed legal, medical, or broadcast-grade accuracy

## Future Opportunities

- Browser microphone recording
- Speaker diarization
- Word-level timestamps
- Translation and bilingual exports
- Automatic summaries and chapters using an optional local language model
- Watch folders for automatic import
- Batch import
- Custom vocabulary and prompt hints
- DOCX and PDF export
- Optional multi-user access policies
- Optional encrypted backups
- Native desktop packaging

## Further Notes

- “Free” means there is no transcription API fee. The user still supplies the computer, electricity, storage, and internet bandwidth for initial software or model downloads.
- Whisper accuracy varies with language, accent, microphone quality, background noise, and model size. The interface should describe results as machine-generated and encourage review.
- The selected Whisper implementation should have an acceptable license, active maintenance, timestamp support, and acceleration support for the target computer.
- Model files can occupy substantial disk space. The setup experience must show approximate download and installed sizes before installation.
- The implementation should keep generated original text alongside edited text. This protects provenance and permits a future “revert segment” feature without retranscription.

## Release Definition

Version 1.0 is ready when the complete successful-transcription flow, authenticated production-domain access, failure recovery, transcript editing, history, deletion, visual-quality requirements, and all three export formats meet the acceptance criteria on the user's target computer. The release must include local setup, Cloudflare deployment, usage, backup, and troubleshooting instructions.
