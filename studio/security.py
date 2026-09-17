import base64
import hashlib
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

import jwt
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool


class Boundary:
    def __init__(self):
        self.hostname = os.getenv("STUDIO_HOSTNAME", "transcribe.bernardyamoah.com")
        self.team = os.getenv("CF_ACCESS_TEAM_DOMAIN", "").removeprefix("https://").rstrip("/")
        self.audience = os.getenv("CF_ACCESS_AUDIENCE", "")
        self.email = os.getenv("CF_ACCESS_EMAIL", "")
        self.jwks = (
            jwt.PyJWKClient(f"https://{self.team}/cdn-cgi/access/certs", timeout=5) if self.team else None
        )
        index = Path(__file__).parent / "static" / "index.html"
        html = index.read_text() if index.exists() else ""
        scripts = re.findall(r"<script([^>]*)>(.*?)</script>", html, re.DOTALL)
        self.script_hashes = [
            "'sha256-"
            + base64.b64encode(hashlib.sha256(body.replace("\0", "\ufffd").encode()).digest()).decode()
            + "'"
            for attributes, body in scripts
            if "src=" not in attributes and body
        ]

    def validate(self, token):
        if not self.jwks or not self.audience or not self.email:
            raise ValueError("Access is not configured")
        key = self.jwks.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=self.audience,
            issuer=f"https://{self.team}",
            options={"require": ["exp", "iat", "iss", "aud", "email"]},
        )
        if claims["email"].casefold() != self.email.casefold():
            raise ValueError("Identity is not allowed")
        return claims["email"]

    async def __call__(self, request, call_next):
        host = request.url.hostname
        local = host in {"localhost", "127.0.0.1", "::1", "testserver"}
        # testserver is accepted only for Starlette's in-process test client.
        if host == "testserver" and request.client.host != "testclient":
            local = False
        if not local and host != self.hostname:
            return JSONResponse({"detail": "Unrecognized origin host."}, status_code=403)
        request.state.access_verified = False
        if not local:
            if request.headers.get("x-forwarded-proto") != "https":
                return JSONResponse({"detail": "HTTPS is required."}, status_code=403)
            try:
                request.state.identity = await run_in_threadpool(
                    self.validate, request.headers.get("cf-access-jwt-assertion", "")
                )
                request.state.access_verified = True
            except Exception:
                return JSONResponse(
                    {
                        "detail": "Cloudflare Access verification failed. Sign in again or check origin configuration."
                    },
                    status_code=403,
                )
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            expected_scheme = "http" if local else "https"
            if origin and (
                urlsplit(origin).netloc != request.url.netloc or urlsplit(origin).scheme != expected_scheme
            ):
                return JSONResponse({"detail": "Cross-origin writes are not allowed."}, status_code=403)
            if request.headers.get("x-studio-request") != "1":
                return JSONResponse({"detail": "Missing application request header."}, status_code=403)
        response = await call_next(request)
        hashes = " ".join(self.script_hashes)
        response.headers["Content-Security-Policy"] = (
            f"default-src 'self'; script-src 'self' {hashes}; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        return response
