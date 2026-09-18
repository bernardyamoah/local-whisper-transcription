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
    def line(segment):
        speaker = segment.get("speaker")
        speaker_name = segment.get("speaker_name")
        prefix = f"{speaker_name or f'Speaker {speaker + 1}'}: " if speaker is not None else ""
        return prefix + segment["text"]

    if kind == "txt":
        return (
            "\n\n".join((f"[{timestamp(s['start'])}] " if timestamps else "") + line(s) for s in segments)
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
        text = line(segment).replace("\r", "").replace("\n\n", "\n").strip()
        if kind == "vtt":
            text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        cues.append(
            f"{index}\n{timestamp(start / 1000, separator)} --> {timestamp(end / 1000, separator)}\n{text}"
        )
    return ("WEBVTT\n\n" if kind == "vtt" else "") + "\n\n".join(cues) + "\n"
