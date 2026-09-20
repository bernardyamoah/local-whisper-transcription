# Website and macOS distribution

Whisper Studio uses two separate delivery surfaces:

- `https://transcribe.bernardyamoah.com` is the public marketing website.
- The installed macOS app owns transcription, editing, history, playback, and export.

The local app binds to loopback and is never published through the website. Cloudflare Tunnel and Cloudflare Access are not part of the product architecture.

## Public website

The website is deployed with Cloudflare Workers Static Assets:

```sh
npm ci
npm run deploy:website:check
npm run deploy:website
```

`wrangler.website.jsonc` maps the custom domain to `whisper-studio-marketing`. Requests for the installer and the app's release feed are handled by `worker/website.js`; all other requests are served from `dist/website`.

## Installer storage

The Apple-silicon DMG is stored in the `whisper-studio-releases` R2 bucket under:

```text
releases/Whisper-Studio-0.5.21-arm64.dmg
```

The stable public URL and release manifest are:

```text
https://transcribe.bernardyamoah.com/download/Whisper-Studio.dmg
https://transcribe.bernardyamoah.com/api/releases/latest
```

Upload a verified release before deploying a website that links to it:

```sh
npm exec wrangler -- r2 object put \
  whisper-studio-releases/releases/Whisper-Studio-0.5.21-arm64.dmg \
  --remote \
  --file dist/Whisper-Studio-0.5.21-arm64.dmg \
  --content-type application/x-apple-diskimage \
  --content-disposition 'attachment; filename="Whisper-Studio-0.5.21-arm64.dmg"' \
  --cache-control 'public, max-age=3600'
```

R2 is used because the installer is larger than Workers Static Assets' per-file limit. Keep versioned objects immutable. The Worker compares the semantic versions in R2 and automatically exposes the newest `Whisper-Studio-X.Y.Z-arm64.dmg` object through both stable URLs, so uploading the next version is enough to make it visible to installed apps.

Installed apps check the manifest on launch and every six hours. Settings shows an update badge, allows a manual download, and offers an opt-in automatic-download switch. Downloads are checked against the R2 object size (and SHA-256 when that checksum is present), then left in the user's Downloads folder for installation.

## Build the macOS installer

On Apple silicon:

```sh
./scripts/build-swiftui.sh
```

The build produces both `dist/Whisper Studio.app` and a versioned DMG. It verifies the disk image before reporting success. Distribution builds should be signed with a Developer ID Application certificate and notarized before upload; the current local build is ad-hoc signed.

## Release checks

1. Verify the DMG with `hdiutil verify` and record its SHA-256 checksum.
2. Mount it and copy Whisper Studio to Applications.
3. Launch the app, finish setup, import a short recording, edit the transcript, and export TXT, SRT, and VTT.
4. Verify the public download with a HEAD request and a ranged GET.
5. Confirm the root domain contains only the marketing site and does not expose `/api`, `/jobs`, `/library`, or local recordings.
