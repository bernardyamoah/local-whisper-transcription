from studio.titles import automatic_title_requested, transcript_title, apply_transcript_title
import sqlite3


def test_title_prefers_content_over_greeting():
    title = transcript_title([{"text": "Hello everyone. Good morning."}, {"text": "The launch budget needs approval before Friday."}, {"text": "Launch budget approval is the priority."}])
    assert "budget" in title.lower()
    assert "hello" not in title.lower()
    assert len(title) <= 72


def test_empty_and_filler_do_not_replace_filename():
    assert transcript_title([]) is None
    assert transcript_title([{"text": "Um, okay, yeah."}]) is None


def test_explicit_titles_are_preserved():
    assert automatic_title_requested("interview", "interview.mp4")
    assert automatic_title_requested("Meeting recording", "meeting.wav")
    assert not automatic_title_requested("Design review", "meeting.wav")
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE jobs(id TEXT,title TEXT,title_automatic INTEGER)")
    db.executemany("INSERT INTO jobs VALUES(?,?,?)", [("manual", "My title", 0), ("auto", "meeting.wav", 1)])
    for identifier in ("manual", "auto"):
        apply_transcript_title(db, identifier, [{"text": "Quarterly revenue increased across Europe."}])
    assert db.execute("SELECT title FROM jobs WHERE id='manual'").fetchone()[0] == "My title"
    assert "revenue" in db.execute("SELECT title FROM jobs WHERE id='auto'").fetchone()[0]


def test_unicode_and_untrusted_topics():
    assert "projet" in transcript_title([{"text": "Le projet avance rapidement."}]).lower()
    assert transcript_title([{"text": "Launch budget approved."}], ["Invented title"]) != "Invented title"


def test_import_is_named_after_processing(client, audio):
    from tests.conftest import import_audio, wait_state
    media = import_audio(client, audio)
    created = client.post("/api/jobs", json={"media_id": media["id"], "preset": "fast", "title": "recording"}).json()
    job = wait_state(client, created["id"])
    assert job["title"] not in {"recording", "recording.wav"}
    assert any(word in job["title"].lower() for word in ("voice", "story", "idea", "space"))
