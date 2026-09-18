import csv
import io
import json
import re
import textwrap
import zipfile
from datetime import datetime
from xml.sax.saxutils import escape

TEXT_FORMATS = {"txt", "md", "csv", "json", "srt", "vtt"}
DOCUMENT_FORMATS = TEXT_FORMATS | {"pdf", "docx"}
CONTENT_VIEWS = {"transcript", "minutes", "actions"}
ACTION_KINDS = {"action", "task", "follow-up", "next step", "blocker", "commitment"}


def timestamp(seconds, separator="."):
    milliseconds = max(0, round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3600000)
    minutes, remainder = divmod(remainder, 60000)
    seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02}{separator}{milliseconds:03}"


def short_timestamp(seconds):
    value = timestamp(seconds).split(".", 1)[0]
    return value[3:] if value.startswith("00:") else value


def filename(title):
    return re.sub(r"[^\w .-]", "", title, flags=re.UNICODE).strip(" .")[:100] or "transcript"


def _speaker(segment):
    speaker = segment.get("speaker")
    if speaker is None:
        return ""
    return segment.get("speaker_name") or f"Speaker {speaker + 1}"


def _segment_text(segment):
    speaker = _speaker(segment)
    return f"{speaker}: {segment['text']}" if speaker else segment["text"]


def _is_action(bookmark):
    kind = bookmark.get("kind", "").lower()
    return any(label in kind for label in ACTION_KINDS)


def document(job):
    segments = sorted(job.get("segments", []), key=lambda item: (item["start"], item["end"]))
    bookmarks = [dict(item) for item in sorted(job.get("bookmarks", []), key=lambda item: item["at"])]
    for bookmark in bookmarks:
        segment = next(
            (item for item in segments if item["start"] <= bookmark["at"] <= item["end"]),
            min(segments, key=lambda item: abs(item["start"] - bookmark["at"])) if segments else None,
        )
        bookmark["text"] = bookmark.get("note") or (segment["text"] if segment else "")
    template = job.get("template", "General")
    return {
        "title": job.get("title", "Transcript"),
        "created": job.get("created"),
        "duration": job.get("duration", 0),
        "language": job.get("detected_language") or job.get("language"),
        "template": template.get("name", "General") if isinstance(template, dict) else template,
        "summary": job.get("notes", {}).get("summary", ""),
        "topics": job.get("notes", {}).get("topics", []),
        "chapters": job.get("notes", {}).get("chapters", []),
        "segments": segments,
        "bookmarks": bookmarks,
        "actions": [item for item in bookmarks if _is_action(item)],
    }


def _metadata(doc):
    created = (
        datetime.fromtimestamp(doc["created"]).astimezone().strftime("%d %b %Y, %H:%M")
        if doc["created"]
        else ""
    )
    return [
        ("Date", created),
        ("Duration", short_timestamp(doc["duration"])),
        ("Language", (doc["language"] or "").upper()),
        ("Template", doc["template"]),
    ]


def _sections(doc, view):
    if view == "actions":
        return [("Action items", [f"[{short_timestamp(item['at'])}] {item['text']}" for item in doc["actions"]])]
    if view == "minutes":
        decisions = [item for item in doc["bookmarks"] if "decision" in item["kind"].lower()]
        moments = [item for item in doc["bookmarks"] if item not in doc["actions"] and item not in decisions]
        return [
            ("Summary", [doc["summary"]] if doc["summary"] else []),
            ("Topics", list(doc["topics"])),
            ("Decisions", [f"[{short_timestamp(item['at'])}] {item['text']}" for item in decisions]),
            ("Action items", [f"[{short_timestamp(item['at'])}] {item['text']}" for item in doc["actions"]]),
            (
                "Key moments",
                [f"[{short_timestamp(item['at'])}] {item['kind']}: {item['text']}" for item in moments],
            ),
        ]
    return [
        ("Transcript", [f"[{short_timestamp(item['start'])}] {_segment_text(item)}" for item in doc["segments"]])
    ]


def render_markdown(doc, view):
    lines = [f"# {doc['title']}", ""]
    lines.extend(f"**{label}:** {value}" for label, value in _metadata(doc) if value)
    for heading, items in _sections(doc, view):
        lines.extend(["", f"## {heading}", ""])
        if not items:
            lines.append("_None_" if heading != "Summary" else "_No summary available._")
        elif heading == "Summary":
            lines.extend(items)
        else:
            lines.extend(f"- {item}" for item in items)
    return "\n".join(lines).strip() + "\n"


def render_text(doc, view, timestamps=False):
    if view == "transcript" and not timestamps:
        return "\n\n".join(_segment_text(item) for item in doc["segments"]) + "\n"
    markdown = render_markdown(doc, view)
    markdown = re.sub(r"^#{1,2} ", "", markdown, flags=re.MULTILINE)
    markdown = re.sub(r"^\*\*(.+?):\*\* ", r"\1: ", markdown, flags=re.MULTILINE)
    return markdown.replace("_None_", "None").replace("_No summary available._", "No summary available.")


def render_csv(doc, view):
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    if view == "transcript":
        writer.writerow(["start", "end", "speaker", "text", "confidence"])
        for item in doc["segments"]:
            writer.writerow(
                [timestamp(item["start"]), timestamp(item["end"]), _speaker(item), item["text"], item.get("confidence")]
            )
    else:
        writer.writerow(["type", "time", "text"])
        items = doc["actions"] if view == "actions" else doc["bookmarks"]
        for item in items:
            writer.writerow([item["kind"], timestamp(item["at"]), item["text"]])
    return output.getvalue()


def render_json(doc, view):
    payload = {key: value for key, value in doc.items() if key not in {"segments", "bookmarks", "actions"}}
    payload["content"] = (
        doc["segments"]
        if view == "transcript"
        else doc["actions"]
        if view == "actions"
        else {
            "summary": doc["summary"],
            "topics": doc["topics"],
            "chapters": doc["chapters"],
            "bookmarks": doc["bookmarks"],
        }
    )
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def render_cues(segments, kind):
    cues, previous = [], 0
    for index, segment in enumerate(sorted(segments, key=lambda item: (item["start"], item["end"])), 1):
        start = max(round(segment["start"] * 1000), previous)
        end = max(round(segment["end"] * 1000), start + 1)
        previous = end
        separator = "," if kind == "srt" else "."
        text = _segment_text(segment).replace("\r", "").replace("\n\n", "\n").strip()
        if kind == "vtt":
            text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        cues.append(
            f"{index}\n{timestamp(start / 1000, separator)} --> {timestamp(end / 1000, separator)}\n{text}"
        )
    return ("WEBVTT\n\n" if kind == "vtt" else "") + "\n\n".join(cues) + "\n"


def render_pdf(doc, view):
    lines = []
    for line in render_text(doc, view, timestamps=True).splitlines():
        lines.extend(textwrap.wrap(line, 88) or [""])
    pages = [lines[index : index + 48] for index in range(0, len(lines), 48)] or [[doc["title"]]]
    objects = [
        b"",
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    page_ids = []
    for page in pages:
        page_id = len(objects)
        content_id = page_id + 1
        page_ids.append(page_id)
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>".encode()
        )
        commands = ["BT /F1 11 Tf 54 738 Td 15 TL"]
        for line in page:
            safe = (
                line.encode("latin-1", "replace")
                .decode("latin-1")
                .replace("\\", "\\\\")
                .replace("(", "\\(")
                .replace(")", "\\)")
            )
            commands.append(f"({safe}) Tj T*")
        stream = ("\n".join(commands) + "\nET").encode("latin-1")
        objects.append(
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
        )
    objects[2] = (
        f"<< /Type /Pages /Kids [{' '.join(f'{item} 0 R' for item in page_ids)}] /Count {len(page_ids)} >>".encode()
    )
    output = io.BytesIO()
    output.write(b"%PDF-1.4\n")
    offsets = [0]
    for index, value in enumerate(objects[1:], 1):
        offsets.append(output.tell())
        output.write(f"{index} 0 obj\n".encode() + value + b"\nendobj\n")
    xref = output.tell()
    output.write(f"xref\n0 {len(objects)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        output.write(f"{offset:010} 00000 n \n".encode())
    output.write(f"trailer << /Size {len(objects)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    return output.getvalue()


def render_docx(doc, view):
    paragraphs = []
    for line in render_markdown(doc, view).splitlines():
        style = "Title" if line.startswith("# ") else "Heading1" if line.startswith("## ") else None
        text = line.lstrip("# ").removeprefix("- ")
        properties = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
        paragraphs.append(
            f'<w:p>{properties}<w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'
        )
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        + "".join(paragraphs)
        + "<w:sectPr/></w:body></w:document>"
    )
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        )
        archive.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        )
        archive.writestr("word/document.xml", document_xml)
    return output.getvalue()


def render_document(job, kind, view="transcript", timestamps=False):
    if kind not in DOCUMENT_FORMATS:
        raise ValueError("Choose Markdown, PDF, DOCX, CSV, JSON, TXT, SRT, or VTT")
    if view not in CONTENT_VIEWS:
        raise ValueError("Choose transcript, meeting minutes, or action items")
    if kind in {"srt", "vtt"} and view != "transcript":
        raise ValueError("Subtitle exports require the full transcript")
    doc = document(job)
    if kind == "txt":
        return render_text(doc, view, timestamps), "text/plain; charset=utf-8"
    if kind == "md":
        return render_markdown(doc, view), "text/markdown; charset=utf-8"
    if kind == "csv":
        return render_csv(doc, view), "text/csv; charset=utf-8"
    if kind == "json":
        return render_json(doc, view), "application/json"
    if kind in {"srt", "vtt"}:
        return render_cues(doc["segments"], kind), "text/vtt" if kind == "vtt" else "application/x-subrip"
    if kind == "pdf":
        return render_pdf(doc, view), "application/pdf"
    return (
        render_docx(doc, view),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


def render(segments, kind, timestamps=False):
    if kind == "txt":
        return (
            "\n\n".join(
                (f"[{timestamp(segment['start'])}] " if timestamps else "")
                + _segment_text(segment)
                for segment in segments
            )
            + "\n"
        )
    content, _ = render_document(
        {"title": "Transcript", "segments": segments}, kind, "transcript", timestamps
    )
    return content


def render_bundle(job, media_path=None, media_name=None):
    doc = document(job)
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("transcript.md", render_markdown(doc, "transcript"))
        archive.writestr("meeting-minutes.md", render_markdown(doc, "minutes"))
        archive.writestr("transcript.json", render_json(doc, "transcript"))
        archive.writestr(
            "manifest.json",
            json.dumps({"title": doc["title"], "version": 1, "media": media_name}, indent=2),
        )
        if media_path and media_path.is_file():
            archive.write(media_path, "media/" + filename(media_name or media_path.name))
    return output.getvalue()
