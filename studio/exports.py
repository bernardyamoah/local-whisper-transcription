import re


def timestamp(seconds, separator="."):
    milliseconds = max(0, round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3600000)
    minutes, remainder = divmod(remainder, 60000)
    seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02}{separator}{milliseconds:03}"


def filename(title):
    return re.sub(r"[^\w .-]", "", title, flags=re.UNICODE).strip(" .")[:100] or "transcript"


def render(segments, kind, timestamps=False):
    if kind == "txt":
        return (
            "\n\n".join((f"[{timestamp(s['start'])}] " if timestamps else "") + s["text"] for s in segments)
            + "\n"
        )
    if kind not in {"srt", "vtt"}:
        raise ValueError("Choose TXT, SRT, or VTT")
    cues, previous = [], 0
    for index, segment in enumerate(sorted(segments, key=lambda s: (s["start"], s["end"])), 1):
        start = max(round(segment["start"] * 1000), previous)
        end = max(round(segment["end"] * 1000), start + 1)
        previous = end
        separator = "," if kind == "srt" else "."
        text = segment["text"].replace("\r", "").replace("\n\n", "\n").strip()
        if kind == "vtt":
            text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        cues.append(
            f"{index}\n{timestamp(start / 1000, separator)} --> {timestamp(end / 1000, separator)}\n{text}"
        )
    return ("WEBVTT\n\n" if kind == "vtt" else "") + "\n\n".join(cues) + "\n"
