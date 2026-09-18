from urllib.parse import urlsplit

from fastapi.responses import JSONResponse

# Exact styles emitted by @number-flow/react 0.6.2. Hashes keep the CSP strict
# while allowing the component's Shadow DOM animation styles.
NUMBER_FLOW_STYLE_HASHES = (
    "'sha256-IRGtDaJoWUyd8zoPZ2Rl1Ad5ErPWovCmj1jXl1LdmQA=' "
    "'sha256-Kf7/sUbgqFJXjmEU4ouAuE2GpLidyjTxmVez5zPkWyQ=' "
    "'sha256-HR6/MuuYfB8aijiNP5MPm3YOR8WqVmL7UkE3Q8OslTs='"
)


class Boundary:
    async def __call__(self, request, call_next):
        host = request.url.hostname
        local = host in {"localhost", "127.0.0.1", "::1", "testserver"}
        # testserver is accepted only for Starlette's in-process test client.
        if host == "testserver" and request.client.host != "testclient":
            local = False
        if not local:
            return JSONResponse(
                {"detail": "Whisper Studio is available only on this Mac."},
                status_code=403,
            )
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            if origin and (
                urlsplit(origin).netloc != request.url.netloc or urlsplit(origin).scheme != "http"
            ):
                return JSONResponse(
                    {"detail": "Cross-origin writes are not allowed."},
                    status_code=403,
                )
            if request.headers.get("x-studio-request") != "1":
                return JSONResponse(
                    {"detail": "Missing application request header."},
                    status_code=403,
                )
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' "
            f"{NUMBER_FLOW_STYLE_HASHES}; img-src 'self' data:; "
            "font-src 'self'; media-src 'self' blob:; connect-src 'self'; frame-ancestors "
            "'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        return response
