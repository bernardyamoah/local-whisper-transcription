"""Private, deterministic title extraction; no transcript leaves this machine."""

import re
from collections import Counter
from pathlib import Path

_STOP = set("a an the this that these those is are was were be been being to of for from with and or but as at in on by it its we our you your i my me he she they their them us have has had do did does can could will would should may might so then than just really very about today let's lets hello hi hey thanks thank everyone okay ok um uh yeah yes no please welcome good morning afternoon evening meeting recording discuss discussing going want need also there here what how when which who if not now".split())
_WORD = re.compile(r"[^\W_]+(?:['’-][^\W_]+)*", re.UNICODE)


def automatic_title_requested(title, filename):
    value = (title or "").strip().casefold()
    return not value or value in {str(filename).casefold(), Path(filename).stem.casefold(), "meeting recording", "new recording", "untitled", "recording"}


def transcript_title(segments, topics=()):
    texts = [str(item.get("text", "")).strip() for item in segments if item.get("text")]
    # Bound work for multi-hour recordings, sampling across the whole conversation.
    if len(texts) > 500:
        texts = texts[::max(1, len(texts) // 500)][:500]
    sentences = [part.strip() for text in texts for part in re.split(r"[.!?。！？\n]+", text) if part.strip()]
    if not sentences:
        return None
    tokens = [_WORD.findall(sentence) for sentence in sentences]
    frequency = Counter(word.casefold() for words in tokens for word in words if len(word) > 2 and word.casefold() not in _STOP)
    if not frequency:
        return None
    # Provider topics are useful only when they actually occur in the transcript.
    for topic in topics or ():
        if isinstance(topic, str) and 2 <= len(_WORD.findall(topic)) <= 9 and len(topic) <= 72:
            if topic.casefold() in " ".join(texts).casefold():
                return topic[0].upper() + topic[1:]
    candidates = []
    for index, words in enumerate(tokens):
        meaningful = [w for w in words if w.casefold() in frequency]
        if len(meaningful) < 2:
            continue
        score = sum(min(frequency[w.casefold()], 12) for w in set(meaningful)) / max(1, len(words)) ** 0.5
        candidates.append((score, -index, words))
    if not candidates:
        return None
    words = max(candidates, key=lambda item: item[:2])[2]
    while words and words[0].casefold() in _STOP:
        words = words[1:]
    words = words[:9]
    while words and words[-1].casefold() in _STOP:
        words.pop()
    result = " ".join(words)
    if len(result) > 72:
        result = result[:73].rsplit(" ", 1)[0]
    return result[0].upper() + result[1:] if result else None


def apply_transcript_title(db, identifier, segments, topics=()):
    title = transcript_title(segments, topics)
    if title:
        db.execute("UPDATE jobs SET title=? WHERE id=? AND title_automatic=1", (title, identifier))
