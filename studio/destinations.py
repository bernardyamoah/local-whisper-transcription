import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

from studio.exports import document, filename, render_markdown


class DestinationError(RuntimeError):
    pass


class ExportDestinations:
    def __init__(self, root):
        self.path = Path(root) / ".export-destinations.json"

    def get(self, reveal=False):
        if not self.path.is_file():
            values = {}
        else:
            try:
                values = json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                values = {}
        if reveal:
            return values
        return {
            "obsidian_vault": values.get("obsidian_vault", ""),
            "obsidian_folder": values.get("obsidian_folder", "Whisper Studio"),
            "notion_parent_id": values.get("notion_parent_id", ""),
            "notion_connected": bool(values.get("notion_token")),
            "webhook_url": values.get("webhook_url", ""),
            "webhook_connected": bool(values.get("webhook_url")),
            "webhook_secret_set": bool(values.get("webhook_secret")),
        }

    def update(self, values):
        current = self.get(reveal=True)
        for key, value in values.items():
            if value is not None:
                current[key] = value.strip()
        self.path.write_text(json.dumps(current), encoding="utf-8")
        os.chmod(self.path, 0o600)
        return self.get()

    def save_obsidian(self, job, view):
        settings = self.get(reveal=True)
        vault = Path(settings.get("obsidian_vault", "")).expanduser()
        if not vault.is_dir():
            raise DestinationError("Choose an existing Obsidian vault in export settings.")
        folder = settings.get("obsidian_folder", "Whisper Studio").strip(" /.")
        target_dir = (vault / folder).resolve()
        if not target_dir.is_relative_to(vault.resolve()):
            raise DestinationError("The Obsidian folder must stay inside the selected vault.")
        target_dir.mkdir(parents=True, exist_ok=True)
        stem = filename(job["title"])
        target = target_dir / f"{stem}.md"
        attempt = 2
        while target.exists():
            target = target_dir / f"{stem} {attempt}.md"
            attempt += 1
        target.write_text(render_markdown(document(job), view), encoding="utf-8")
        return {"destination": "obsidian", "path": str(target)}

    def send_notion(self, job, view):
        settings = self.get(reveal=True)
        token = settings.get("notion_token")
        parent_id = settings.get("notion_parent_id")
        if not token or not parent_id:
            raise DestinationError("Connect Notion in export settings first.")
        markdown = render_markdown(document(job), view)
        children = []
        for line in markdown.splitlines()[1:]:
            text = line.lstrip("#- ").strip()
            if not text:
                continue
            block_type = "heading_2" if line.startswith("## ") else "bulleted_list_item" if line.startswith("- ") else "paragraph"
            children.append(
                {
                    "object": "block",
                    "type": block_type,
                    block_type: {"rich_text": [{"type": "text", "text": {"content": text[:2000]}}]},
                }
            )
        payload = {
            "parent": {"type": "page_id", "page_id": parent_id},
            "properties": {
                "title": {
                    "type": "title",
                    "title": [{"type": "text", "text": {"content": job["title"][:2000]}}],
                }
            },
            "children": children[:100],
        }
        response = self._post(
            "https://api.notion.com/v1/pages",
            payload,
            {"Authorization": f"Bearer {token}", "Notion-Version": "2026-03-11"},
        )
        return {"destination": "notion", "url": response.get("url"), "id": response.get("id")}

    def send_webhook(self, job, view):
        settings = self.get(reveal=True)
        url = settings.get("webhook_url", "")
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise DestinationError("Enter a valid HTTP or HTTPS webhook URL in export settings.")
        headers = {}
        if settings.get("webhook_secret"):
            headers["Authorization"] = f"Bearer {settings['webhook_secret']}"
        payload = {
            "event": "transcript.exported",
            "version": 1,
            "view": view,
            "transcript": document(job),
        }
        response = self._post(url, payload, headers)
        return {"destination": "webhook", "status": "delivered", "response": response}

    def _post(self, url, payload, headers):
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "User-Agent": "Whisper-Studio/1", **headers},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                body = response.read(1_000_000)
                if not body:
                    return {"status": response.status}
                try:
                    return json.loads(body)
                except json.JSONDecodeError:
                    return {"status": response.status, "body": body.decode("utf-8", "replace")}
        except urllib.error.URLError as error:
            reason = getattr(error, "reason", error)
            raise DestinationError(f"Delivery failed: {reason}") from error
