import stat

from studio.destinations import ExportDestinations


def job():
    return {
        "title": "Planning session",
        "created": 1,
        "duration": 12,
        "language": "en",
        "template": {"name": "General"},
        "notes": {"summary": "Plan the launch", "topics": ["Launch"], "chapters": []},
        "segments": [{"start": 0, "end": 4, "text": "Ship on Friday."}],
        "bookmarks": [{"at": 1, "kind": "Action", "note": "Prepare the release"}],
    }


def test_destination_secrets_are_private_and_delivery_payloads_are_typed(tmp_path, monkeypatch):
    destinations = ExportDestinations(tmp_path)
    visible = destinations.update(
        {
            "notion_token": "secret_notion",
            "notion_parent_id": "page-id",
            "webhook_url": "https://hooks.example.test/transcript",
            "webhook_secret": "secret_hook",
        }
    )
    assert visible["notion_connected"] is True
    assert "notion_token" not in visible
    assert stat.S_IMODE(destinations.path.stat().st_mode) == 0o600

    requests = []
    monkeypatch.setattr(
        destinations,
        "_post",
        lambda url, payload, headers: requests.append((url, payload, headers)) or {"id": "page", "url": "https://notion.so/page"},
    )
    notion = destinations.send_notion(job(), "minutes")
    assert notion["id"] == "page"
    assert requests[0][1]["parent"]["page_id"] == "page-id"
    assert requests[0][2]["Notion-Version"] == "2026-03-11"

    destinations.send_webhook(job(), "actions")
    assert requests[1][1]["event"] == "transcript.exported"
    assert requests[1][1]["view"] == "actions"
    assert requests[1][2]["Authorization"] == "Bearer secret_hook"
