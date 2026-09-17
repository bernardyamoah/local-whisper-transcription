# Private domain deployment

The application is designed for one owner and one always-on macOS or Linux host. Publishing the origin requires access to the Cloudflare account managing `bernardyamoah.com`. Do not treat the DNS hostname as authentication.

## 1. Prepare the local host

Install dependencies and run `uv run whisper-studio`. Verify `http://127.0.0.1:8765`, install a model through the app, and transcribe a short recording. Keep the application bound to loopback. Do not open a router port.

For persistent operation, run the launcher under launchd on macOS or systemd on Linux. `scripts/run-studio.sh` supplies a stable foreground entrypoint for a supervisor. Use an absolute checkout path, an explicit PATH containing uv and FFmpeg, and a protected `.env` file. Start only one instance per data directory. Disable automatic host sleep if remote availability is needed.

## 2. Create the Access boundary first

In Cloudflare Zero Trust, create a **self-hosted Access application** covering the entire `transcribe.bernardyamoah.com` hostname, including every path. Set a finite session duration (for example 12 hours). Add a reusable **Allow** policy with **Include → Emails → your verified owner email**. Use an existing identity provider or one-time PIN. Do not add an Everyone rule or bypass policy.

Record the team domain and the application's **AUD tag**. In the local `.env`:

```dotenv
STUDIO_HOSTNAME=transcribe.bernardyamoah.com
CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
CF_ACCESS_AUDIENCE=the-application-aud-tag
CF_ACCESS_EMAIL=your-verified-owner-email
```

Restart with `uv run --env-file .env whisper-studio`. These values are configuration; keep the file out of Git. The tunnel token is a secret and also must never be committed.

The origin verifies the JWT signature using the team JWKS endpoint, requires expiration/issuer/audience/email claims, checks the exact owner email, and requires `X-Forwarded-Proto: https`. Merely supplying a Cloudflare-looking header cannot authenticate a request. JWKS keys are cached; after restart, public requests may require internet access to retrieve signing keys. Localhost remains the recovery path.

## 3. Connect a remotely managed Tunnel

Create a remotely managed Cloudflare Tunnel. Install `cloudflared` on the same host and follow the dashboard's connector-service instructions using that tunnel's token. Add a published application route:

- Hostname: `transcribe.bernardyamoah.com`
- Service type: HTTP
- Service URL: `127.0.0.1:8765`
- Preserve the public HTTP Host, or explicitly set it to `transcribe.bernardyamoah.com`.
- Enable Access protection/token validation on the connector when available, in addition to the origin's checks.

The dashboard provisions the DNS route. Confirm no conflicting pre-existing DNS record before changing it. Do not configure an unauthenticated public fallback. If the origin sees `localhost` as the forwarded Host, correct the tunnel Host configuration before launch: public traffic must go through the production-host JWT path.

## 4. Verify before calling it live

1. An incognito browser without owner authentication must receive the Access challenge/denial, including requests to `/api/jobs`, `/api/media`, `/static/app.js`, and playback/export routes.
2. An unrelated identity must be denied.
3. The owner can sign in and reach the app over HTTPS. Settings must report **Verified Cloudflare identity** and **verified request**.
4. A production-host request with a missing, expired, wrong-audience, or forged JWT must receive HTTP 403.
5. Import, transcribe, edit, reload, and download each export over the domain.
6. Stop the connector: the domain should show Cloudflare's unavailable-origin page and expose no studio data. A page that was already open reports connection failure. A stopped origin cannot serve its own custom offline page.
7. Restore the connector and confirm prior work remains. Test the localhost recovery URL separately.

The app reports tunnel verification only from a successfully authenticated incoming request. A localhost request cannot prove public reachability and explicitly says so; no synthetic reachability claim is made.

## Upload limits

Cloudflare imposes a plan-dependent maximum HTTP request body. Uploads larger than that limit return 413 before reaching the host, even though local uploads allow up to 8 GB. Use localhost for larger recordings. Interrupted uploads are removed and may be retried from the beginning; resumable/chunked upload support is not implemented.

## Official references

- [Cloudflare: publish a self-hosted application](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Cloudflare: validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [faster-whisper runtime and hardware requirements](https://github.com/SYSTRAN/faster-whisper)
