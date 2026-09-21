"""Self-contained OAuth result document; no tokens or provider errors enter the HTML."""


def connection_page(state: str) -> str:
    title, description, note = {
        "success": (
            "You're connected.",
            "Google Meet is ready in Whisper Studio.",
            "Return to the app. You can close this tab.",
        ),
        "cancelled": (
            "Maybe next time.",
            "Google Meet wasn't connected.",
            "Return to Connections in Whisper Studio whenever you're ready.",
        ),
        "error": (
            "Let's try that again.",
            "We couldn't finish connecting Google Meet.",
            "Return to Connections in Whisper Studio and choose Continue with Google.",
        ),
    }[state]
    symbol = (
        '<path d="m9 16 5 5 10-11"/>' if state == "success"
        else '<path d="M16 9v9m0 5h.01"/>'
    )
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>{title} — Whisper Studio</title>
<link rel="stylesheet" href="/static/connection.css"></head>
<body class="{state}">
<header><img src="/static/mark.svg" width="28" height="28" alt=""><span>Whisper Studio</span></header>
<main>
<div class="illustration" aria-hidden="true">
<div class="bridge"></div>
<div class="identity"><div class="tile studio"><img src="/static/mark.svg" alt="" width="112" height="112"></div><span>Whisper Studio</span></div>
<div class="result"><svg viewBox="0 0 32 32">{symbol}</svg></div>
<div class="identity"><div class="tile meet"><img src="/static/brands/google-meet.svg" alt="" width="74" height="74"></div><span>Google Meet</span></div>
</div>
<h1>{title}</h1><p class="description">{description}</p>
<div class="instruction"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 7.5h.01M10 7.5h.01"/></svg><p>{note}</p></div>
</main><footer>Whisper Studio for Mac</footer></body></html>'''
