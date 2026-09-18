MEETING_TEMPLATES = {
    "general": {
        "name": "General",
        "description": "Key points, decisions, and next steps",
        "bookmarks": ["Key point", "Decision", "Action", "Question"],
    },
    "standup": {
        "name": "Standup",
        "description": "Updates, blockers, and commitments",
        "bookmarks": ["Update", "Blocker", "Action", "Decision"],
    },
    "interview": {
        "name": "Interview",
        "description": "Answers, quotes, and follow-ups",
        "bookmarks": ["Answer", "Quote", "Follow-up", "Concern"],
    },
    "customer": {
        "name": "Customer call",
        "description": "Needs, pain points, and next steps",
        "bookmarks": ["Need", "Pain point", "Decision", "Next step"],
    },
    "lecture": {
        "name": "Lecture",
        "description": "Concepts, examples, and review points",
        "bookmarks": ["Concept", "Example", "Question", "Review"],
    },
}


def template(identifier: str) -> dict:
    return {"id": identifier} | MEETING_TEMPLATES[identifier]


def templates() -> list[dict]:
    return [template(identifier) for identifier in MEETING_TEMPLATES]
