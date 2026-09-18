import MatrixOrb from "@/components/ui/matrix-orb";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown02Icon,
  ArrowLeft02Icon,
  ArrowUp02Icon,
  ArrowUpRight01Icon,
  BookmarkAdd02Icon,
  Download02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import NumberFlow from "@number-flow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteButton } from "@/components/ui/delete-button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { StepPlayer } from "@/components/ui/step-player";
import { Textarea } from "@/components/ui/textarea";
import { useStudio } from "../components/studio-context";
import {
  Button,
  ConfirmDialog,
  PageHeader,
  ProgressBar,
  type ConfirmRequest,
} from "../components/ui";
import { api, date, time, titleCase } from "../lib/api";
import { downloadTranscript } from "../lib/export";
import { queueNotice } from "../lib/notices";
import {
  checkTranscription,
  prepareSystemNotifications,
  trackTranscription,
} from "../lib/system-notifications";
import type { Bookmark, Job, Segment } from "../lib/types";

export const Route = createFileRoute("/jobs/$jobId")({ component: JobPage });

function JobPage() {
  const { jobId } = Route.useParams();
  const { notice } = useStudio();
  const [job, setJob] = useState<Job>();
  const load = useCallback(async () => {
    try {
      const value = await api<Job>(`/jobs/${jobId}`);
      const completed = checkTranscription(value);
      if (completed) notice(completed);
      setJob(value);
    } catch (reason) {
      notice((reason as Error).message, true);
    }
  }, [jobId, notice]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!job || job.state === "completed") return;
    const timer = window.setInterval(() => void load(), 500);
    return () => window.clearInterval(timer);
  }, [job, load]);
  if (!job) return <p className="loading">Loading…</p>;
  return job.state === "completed" ? (
    <Editor initial={job} />
  ) : (
    <JobProgress job={job} reload={load} />
  );
}

function JobProgress({
  job,
  reload,
}: {
  job: Job;
  reload: () => Promise<void>;
}) {
  const { notice } = useStudio();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const active = [
    "queued",
    "preparing",
    "transcribing",
    "saving",
    "cancelling",
  ].includes(job.state);

  async function close(accepted: boolean) {
    setConfirm(null);
    if (!accepted) return;
    try {
      await api(`/jobs/${job.id}/cancel`, { method: "POST" });
      await reload();
      notice({
        title: "Transcription stopped",
        description:
          "The recording is still available whenever you want to retry.",
        kind: "info",
      });
    } catch (reason) {
      notice((reason as Error).message, true);
    }
  }

  async function remove() {
    try {
      await api(`/jobs/${job.id}`, {
        method: "DELETE",
        body: JSON.stringify({ scope: "all", confirm: true }),
      });
      notice({
        title: "Transcription deleted",
        description:
          "The transcript and its recording were removed from this Mac.",
      });
      await navigate({ to: "/library" });
    } catch (reason) {
      notice((reason as Error).message, true);
    }
  }

  return (
    <section className="processing-page">
      <PageHeader
        title={job.title}
        subtitle={`${time(job.duration)} · ${titleCase(job.preset)}`}
      />
      <div className="processing-frame">
        <div className="progress-panel" data-active={active}>
          <div className="processing-topline">
            <span className="processing-state" role="status">
              <i aria-hidden="true" />
              {titleCase(job.state)}
            </span>
            <span>{job.backend?.toUpperCase() || "LOCAL"}</span>
          </div>
          <div className="processing-orb" aria-hidden="true">
            <MatrixOrb
              state={active && job.state !== "cancelling" ? "thinking" : "idle"}
              size={200}
              color="#d87e5f"
              labels={{ idle: "", thinking: "" }}
            />
          </div>
          <div className="processing-percentage" aria-hidden="true">
            <NumberFlow
              value={Math.round(job.progress)}
              trend={1}
              transformTiming={{
                duration: 450,
                easing: "cubic-bezier(0.23, 1, 0.32, 1)",
              }}
              spinTiming={{
                duration: 450,
                easing: "cubic-bezier(0.23, 1, 0.32, 1)",
              }}
              opacityTiming={{ duration: 180, easing: "ease-out" }}
            />
            <span>%</span>
          </div>
          {job.error && <p>{job.error}</p>}
          <ProgressBar value={job.progress} label="Transcription progress" />
          <div className="progress-details">
            <span>{time(job.duration)} recording</span>
            <span>
              {job.started
                ? `${time((job.finished || Date.now() / 1000) - job.started)} elapsed`
                : "Waiting for worker"}
            </span>
          </div>
          <div className="stages">
            {["preparing", "transcribing", "saving"].map((stage, index) => (
              <span
                key={stage}
                className={stage === job.state ? "current" : ""}
                aria-current={stage === job.state ? "step" : undefined}
              >
                <span className="stage-number" aria-hidden="true">
                  {index + 1}
                </span>
                {titleCase(stage)}
              </span>
            ))}
          </div>
          <div className="processing-actions">
            {active ? (
              <Button
                variant="outline"
                disabled={job.state === "cancelling"}
                onClick={() => {
                  setConfirm({
                    title: "Stop this transcription?",
                    description: "The recording stays available for a retry.",
                    label: "Stop transcription",
                  });
                }}
              >
                {job.state === "cancelling"
                  ? "Cancelling…"
                  : "Cancel transcription"}
              </Button>
            ) : (
              <Button
                disabled={!job.source_available}
                onClick={async () => {
                  try {
                    void prepareSystemNotifications();
                    await api(`/jobs/${job.id}/retry`, { method: "POST" });
                    trackTranscription(job);
                    notice({
                      title: "Transcription restarted",
                      description:
                        "Whisper is processing the recording again locally.",
                      kind: "info",
                    });
                    await reload();
                  } catch (reason) {
                    notice((reason as Error).message, true);
                  }
                }}
              >
                Try again
                <HugeiconsIcon
                  icon={ArrowUpRight01Icon}
                  size={15}
                  strokeWidth={1.8}
                />
              </Button>
            )}{" "}
            <Link className={buttonVariants({ variant: "outline" })} to="/">
              Add another recording
            </Link>
          </div>
          {!active && (
            <div className="progress-delete">
              <span>Delete recording and transcript</span>
              <DeleteButton className="model-delete" onConfirm={remove} />
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        request={confirm}
        onClose={(accepted) => void close(accepted)}
      />
    </section>
  );
}

function Editor({ initial }: { initial: Job }) {
  const { notice } = useStudio();
  const navigate = useNavigate();
  const [title, setTitle] = useState(initial.title);
  const [segments, setSegments] = useState(initial.segments);
  const [saveStatus, setSaveStatus] = useState("All changes saved");
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [format, setFormat] = useState("txt");
  const [exporting, setExporting] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [ended, setEnded] = useState(false);
  const [follow, setFollow] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [active, setActive] = useState<number>();
  const [scope, setScope] = useState("all");
  const [retrying, setRetrying] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(
    initial.bookmarks || [],
  );
  const [bookmarkKind, setBookmarkKind] = useState(
    initial.template.bookmarks[0] || "Key point",
  );
  const media = useRef<HTMLMediaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = transcript.current;
    if (!container) return;
    const resize = () =>
      container.querySelectorAll("textarea").forEach((element) => {
        element.style.height = "0px";
        element.style.height = `${element.scrollHeight + 2}px`;
      });
    let width = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== width) {
        width = entry.contentRect.width;
        resize();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const timer = useRef<number | undefined>(undefined);
  const revision = useRef(initial.revision);
  const pending = useRef<Map<number, string>>(new Map());
  const pendingSpeakers = useRef<Map<number, string>>(new Map());
  const pendingTitle = useRef<string | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const undo = useRef<{ id: number; text: string }[]>([]);

  const matches = useMemo(
    () =>
      query
        ? segments
            .filter((segment) =>
              segment.text.toLowerCase().includes(query.toLowerCase()),
            )
            .map((segment) => segment.id)
        : [],
    [query, segments],
  );

  const save = useCallback(async () => {
    if (saving.current) {
      await saving.current;
      return;
    }
    if (
      !pending.current.size &&
      !pendingSpeakers.current.size &&
      pendingTitle.current === null
    )
      return;
    const changes = [...pending.current].map(([id, text]) => ({ id, text }));
    const speakers = [...pendingSpeakers.current].map(([speaker, name]) => ({
      speaker,
      name,
    }));
    const nextTitle = pendingTitle.current;
    pending.current.clear();
    pendingSpeakers.current.clear();
    pendingTitle.current = null;
    setSaveStatus("Saving…");
    saving.current = api<{ revision: number }>(`/jobs/${initial.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        revision: revision.current,
        segments: changes,
        speakers,
        ...(nextTitle !== null ? { title: nextTitle } : {}),
      }),
    })
      .then((result) => {
        revision.current = result.revision;
        setSaveStatus("All changes saved");
      })
      .catch((reason: Error) => {
        setSaveStatus("Not saved · keep this tab open");
        notice(reason.message, true);
      })
      .finally(() => {
        saving.current = null;
      });
    await saving.current;
  }, [initial.id, notice]);

  function scheduleSave() {
    setSaveStatus("Unsaved changes");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), 650);
  }

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      void save();
    },
    [save],
  );
  useEffect(() => {
    if (media.current) media.current.playbackRate = speed;
  }, [speed]);

  function updateSegment(id: number, text: string) {
    if (!pending.current.has(id)) {
      const current = segments.find((segment) => segment.id === id)?.text || "";
      undo.current.push({ id, text: current });
    }
    setSegments((items) =>
      items.map((segment) =>
        segment.id === id ? { ...segment, text } : segment,
      ),
    );
    pending.current.set(id, text);
    scheduleSave();
  }

  function renameSpeaker(speaker: number, name: string) {
    setSegments((items) =>
      items.map((segment) =>
        segment.speaker === speaker
          ? { ...segment, speaker_name: name }
          : segment,
      ),
    );
    pendingSpeakers.current.set(speaker, name);
    scheduleSave();
  }

  function seek(seconds: number, autoplay = true) {
    if (!media.current) return;
    setEnded(false);
    media.current.currentTime = seconds;
    setPlaybackTime(seconds);
    if (autoplay) playMedia();
  }

  function playMedia() {
    void media.current?.play().catch((reason: DOMException) => {
      if (reason.name !== "AbortError") notice(reason.message, true);
    });
  }

  function updatePlayback(element: HTMLMediaElement) {
    setPlaybackTime(element.currentTime);
    const current = segments.find(
      (segment) =>
        segment.start <= element.currentTime &&
        element.currentTime < segment.end,
    )?.id;
    setActive(current);
    if (follow && current !== undefined && current !== active)
      document.querySelector(`[data-segment="${current}"]`)?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
  }

  async function remove() {
    await save();
    try {
      await api(`/jobs/${initial.id}`, {
        method: "DELETE",
        body: JSON.stringify({ scope, confirm: true }),
      });
      notice({
        title: scope === "all" ? "Transcript deleted" : "Transcript cleared",
        description:
          scope === "all"
            ? "The transcript and recording were removed from this Mac."
            : "The transcript was removed; the recording remains in your library.",
      });
      await navigate({ to: "/library" });
    } catch (reason) {
      notice((reason as Error).message, true);
    }
  }

  async function retry() {
    setRetrying(true);
    try {
      await save();
      await api(`/jobs/${initial.id}/retry`, { method: "POST" });
      queueNotice({
        title: "Transcription restarted",
        description: "Whisper is processing the recording again locally.",
        kind: "info",
      });
      window.location.reload();
    } catch (reason) {
      setRetrying(false);
      notice((reason as Error).message, true);
    }
  }

  async function addBookmark() {
    try {
      const bookmark = await api<Bookmark>(`/jobs/${initial.id}/bookmarks`, {
        method: "POST",
        body: JSON.stringify({ at: playbackTime, kind: bookmarkKind }),
      });
      setBookmarks((items) =>
        [...items, bookmark].sort((left, right) => left.at - right.at),
      );
      notice({ title: `${bookmarkKind} bookmarked` });
    } catch (reason) {
      notice((reason as Error).message, true);
    }
  }

  async function removeBookmark(bookmark: Bookmark) {
    try {
      await api(`/jobs/${initial.id}/bookmarks/${bookmark.id}`, {
        method: "DELETE",
      });
      setBookmarks((items) => items.filter((item) => item.id !== bookmark.id));
    } catch (reason) {
      notice((reason as Error).message, true);
    }
  }

  const selectedMatch = matches.length
    ? matches[Math.min(matchIndex, matches.length - 1)]
    : undefined;
  const playerSegments = useMemo(() => {
    if (!segments.length)
      return [{ id: -1, start: 0, end: initial.duration, text: "" }];
    if (segments.length <= 8) return segments;
    return Array.from(
      { length: 8 },
      (_, index) => segments[Math.round((index * (segments.length - 1)) / 7)],
    );
  }, [segments, initial.duration]);
  let playerStep = 0;
  playerSegments.forEach((segment, index) => {
    if (segment.start <= playbackTime) playerStep = index;
  });
  return (
    <section className="editor-page">
      <h1 className="visually-hidden">Transcript editor</h1>
      <Link className="editor-back" to="/library">
        <HugeiconsIcon icon={ArrowLeft02Icon} size={16} strokeWidth={1.8} />
        Back to library
      </Link>
      <div className="page-heading">
        <div className="editor-header">
          <label className="visually-hidden" htmlFor="transcript-title">
            Transcript title
          </label>
          <Input
            id="transcript-title"
            type="text"
            maxLength={200}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              pendingTitle.current = event.target.value;
              scheduleSave();
            }}
            onBlur={() => void save()}
          />
          <p className="subtitle">
            {time(initial.duration)} ·{" "}
            {(initial.detected_language || initial.language).toUpperCase()} ·{" "}
            {titleCase(initial.preset)} · {date(initial.created)}
          </p>
        </div>
        <span id="save-status" className="save-status" role="status">
          {saveStatus}
        </span>
      </div>
      {!!segments.length && (
        <div className="editor-toolbar">
          <label className="visually-hidden" htmlFor="transcript-search">
            Find in transcript
          </label>
          <Input
            id="transcript-search"
            type="search"
            placeholder="Search transcript"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setMatchIndex(0);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            aria-label="Previous search match"
            onClick={() =>
              setMatchIndex(
                matches.length
                  ? (matchIndex - 1 + matches.length) % matches.length
                  : 0,
              )
            }
          >
            <HugeiconsIcon icon={ArrowUp02Icon} size={15} strokeWidth={1.8} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Next search match"
            onClick={() =>
              setMatchIndex(
                matches.length ? (matchIndex + 1) % matches.length : 0,
              )
            }
          >
            <HugeiconsIcon icon={ArrowDown02Icon} size={15} strokeWidth={1.8} />
          </Button>
          <span id="match-count" className="helper" aria-live="polite">
            {query
              ? `${matches.length ? matchIndex + 1 : 0} / ${matches.length}`
              : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const last = undo.current.pop();
              if (last) updateSegment(last.id, last.text);
            }}
          >
            Undo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await save();
              await navigator.clipboard.writeText(
                segments.map((segment) => segment.text).join("\n\n"),
              );
              notice({
                title: "Transcript copied",
                description: `${segments.length} ${segments.length === 1 ? "segment" : "segments"} copied to the clipboard.`,
              });
            }}
          >
            Copy
          </Button>
          <label className="visually-hidden" htmlFor="export-format">
            Export format
          </label>
          <AppSelect
            id="export-format"
            value={format}
            onValueChange={setFormat}
            options={[
              { value: "txt", label: "TXT" },
              { value: "srt", label: "SRT" },
              { value: "vtt", label: "VTT" },
            ]}
          />
          <Button
            size="sm"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await save();
                await downloadTranscript(
                  initial.id,
                  format,
                  `${title}.${format}`,
                );
                notice({
                  title: "Transcript exported",
                  description: `${title}.${format} was saved to Downloads.`,
                });
              } catch (reason) {
                notice((reason as Error).message, true);
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? "Exporting…" : "Export"}
            <HugeiconsIcon icon={Download02Icon} size={15} strokeWidth={1.8} />
          </Button>
        </div>
      )}
      <div className="player">
        {initial.playback_available ? (
          <>
            {initial.playback_kind === "video" && (
              <div className="video-player-frame">
                <video
                  ref={(node) => {
                    media.current = node;
                  }}
                  preload="metadata"
                  playsInline
                  aria-label={`${title} video`}
                  src={`/api/jobs/${initial.id}/video`}
                  onClick={() =>
                    media.current?.paused ? playMedia() : media.current?.pause()
                  }
                  onPlay={() => {
                    setPlaying(true);
                    setEnded(false);
                  }}
                  onPause={() => setPlaying(false)}
                  onEnded={() => {
                    setPlaying(false);
                    setEnded(true);
                  }}
                  onTimeUpdate={(event) => updatePlayback(event.currentTarget)}
                />
              </div>
            )}
            <div className="player-transport">
              {initial.playback_kind === "audio" && (
                <div className="playback-orb" aria-hidden="true">
                  <MatrixOrb
                    state={playing ? "listening" : "idle"}
                    size={64}
                    color="#d87e5f"
                    labels={{ idle: "", listening: "" }}
                  />
                </div>
              )}
              <StepPlayer
                className={
                  initial.playback_kind === "video"
                    ? "rare-audio-player rare-video-player"
                    : "rare-audio-player"
                }
                steps={playerSegments.map((segment) => ({
                  label: `Play from ${time(segment.start)}`,
                }))}
                value={playerStep}
                playing={playing}
                duration={0}
                size={44}
                ended={ended}
                stepProgress={
                  (playbackTime - playerSegments[playerStep].start) /
                  Math.max(
                    0.001,
                    (playerSegments[playerStep + 1]?.start ??
                      initial.duration) - playerSegments[playerStep].start,
                  )
                }
                seekable
                controlPosition="left"
                onValueChange={(index) => {
                  const segment = playerSegments[index];
                  if (!media.current || !segment) return;
                  setEnded(false);
                  media.current.currentTime = segment.start;
                  setPlaybackTime(segment.start);
                  setActive(segment.id);
                }}
                onPlayingChange={(next) => {
                  if (!media.current) return;
                  if (next) playMedia();
                  else media.current.pause();
                }}
              />
              <span className="player-clock">
                {time(playbackTime)} <span>/ {time(initial.duration)}</span>
              </span>
            </div>
            <Slider
              id="audio-seek"
              className="audio-seek"
              min={0}
              max={initial.duration || 1}
              step={0.1}
              value={[Math.min(playbackTime, initial.duration)]}
              aria-label="Seek recording"
              aria-valuetext={time(playbackTime)}
              onValueChange={(next) => {
                const value = Number(Array.isArray(next) ? next[0] : next);
                if (media.current) media.current.currentTime = value;
                setEnded(false);
                setPlaybackTime(value);
                setActive(
                  segments.find(
                    (segment) => segment.start <= value && value < segment.end,
                  )?.id,
                );
              }}
            />
            <div className="player-options">
              <div className="volume-control">
                <span>Volume</span>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={[volume]}
                  aria-label="Volume"
                  onValueChange={(next) => {
                    const value = Number(Array.isArray(next) ? next[0] : next);
                    setVolume(value);
                    if (media.current) media.current.volume = value;
                  }}
                />
              </div>
              {initial.playback_kind === "audio" && (
                <audio
                  ref={(node) => {
                    media.current = node;
                  }}
                  hidden
                  preload="metadata"
                  src={`/api/jobs/${initial.id}/audio`}
                  onPlay={() => {
                    setPlaying(true);
                    setEnded(false);
                  }}
                  onPause={() => setPlaying(false)}
                  onEnded={() => {
                    setPlaying(false);
                    setEnded(true);
                  }}
                  onTimeUpdate={(event) => updatePlayback(event.currentTarget)}
                />
              )}
              <label className="visually-hidden" htmlFor="speed">
                Playback speed
              </label>
              <AppSelect
                id="speed"
                value={String(speed)}
                onValueChange={(value) => setSpeed(Number(value))}
                options={[0.75, 1, 1.25, 1.5, 2].map((value) => ({
                  value: String(value),
                  label: `${value}x`,
                }))}
              />
            </div>
          </>
        ) : (
          <p className="helper">Recording removed. Playback unavailable.</p>
        )}
      </div>
      <section className="bookmark-panel" aria-labelledby="bookmarks-title">
        <div className="bookmark-panel-heading">
          <div>
            <h2 id="bookmarks-title">Bookmarks</h2>
            <p>{initial.template.name}</p>
          </div>
          <div className="bookmark-create">
            <label className="visually-hidden" htmlFor="bookmark-kind">
              Bookmark type
            </label>
            <AppSelect
              id="bookmark-kind"
              value={bookmarkKind}
              onValueChange={setBookmarkKind}
              options={initial.template.bookmarks.map((kind) => ({
                value: kind,
                label: kind,
              }))}
            />
            <Button size="sm" onClick={() => void addBookmark()}>
              <HugeiconsIcon
                icon={BookmarkAdd02Icon}
                size={15}
                strokeWidth={1.8}
              />
              Bookmark {time(playbackTime)}
            </Button>
          </div>
        </div>
        {bookmarks.length ? (
          <div className="bookmark-list">
            {bookmarks.map((bookmark) => (
              <div className="bookmark-item" key={bookmark.id}>
                <Button
                  variant="ghost"
                  className="bookmark-seek"
                  onClick={() => seek(bookmark.at)}
                >
                  <span>{time(bookmark.at)}</span>
                  <strong>{bookmark.kind}</strong>
                </Button>
                <DeleteButton
                  className="bookmark-delete"
                  onConfirm={() => removeBookmark(bookmark)}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="bookmark-empty">
            Mark the moments you want to return to.
          </p>
        )}
      </section>
      {initial.notes &&
        (initial.notes.summary || initial.notes.chapters.length > 0) && (
          <section
            className="meeting-notes"
            aria-labelledby="meeting-notes-title"
          >
            <div className="meeting-notes-copy">
              <h2 id="meeting-notes-title">Notes</h2>
              {initial.notes.summary && <p>{initial.notes.summary}</p>}
              {!!initial.notes.topics.length && (
                <div className="topic-list" aria-label="Topics">
                  {initial.notes.topics.map((topic) => (
                    <span key={topic}>{topic}</span>
                  ))}
                </div>
              )}
            </div>
            {!!initial.notes.chapters.length && (
              <div className="chapter-list">
                {initial.notes.chapters.map((chapter, index) => (
                  <Button
                    variant="ghost"
                    key={`${chapter.start}-${chapter.title}`}
                    onClick={() => seek(chapter.start)}
                  >
                    <span>{time(chapter.start)}</span>
                    <strong>{chapter.title}</strong>
                    <small>{String(index + 1).padStart(2, "0")}</small>
                  </Button>
                ))}
              </div>
            )}
          </section>
        )}
      {!!segments.length && (
        <label className="toggle-row">
          <Checkbox
            checked={follow}
            onCheckedChange={(checked) => setFollow(checked === true)}
          />{" "}
          Follow playback
        </label>
      )}
      <div className="transcript" ref={transcript}>
        {!!segments.length && (
          <div className="transcript-heading">
            <h2>Transcript</h2>
            <span>
              {segments.reduce(
                (count, segment) =>
                  count +
                  segment.text.trim().split(/\s+/).filter(Boolean).length,
                0,
              )}{" "}
              words
            </span>
          </div>
        )}
        {segments.length ? (
          segments.map((segment) => {
            const playbackState =
              active === segment.id
                ? "current"
                : segment.end <= playbackTime
                  ? "past"
                  : "upcoming";
            return (
              <div
                key={segment.id}
                data-segment={segment.id}
                data-playback={playbackState}
                aria-current={playbackState === "current" ? "true" : undefined}
                className={`segment ${playbackState === "current" ? "active" : ""} ${matches.includes(segment.id) ? "match" : ""} ${selectedMatch === segment.id ? "selected-match" : ""}`}
              >
                <Button
                  variant="ghost"
                  size="xs"
                  className="timestamp"
                  disabled={!initial.playback_available}
                  aria-label={`Play from ${time(segment.start)}`}
                  onClick={() => seek(segment.start)}
                >
                  {time(segment.start)}
                </Button>
                <div className="segment-copy">
                  {segment.speaker !== null &&
                    segment.speaker !== undefined && (
                      <Input
                        className="speaker-label"
                        aria-label={`Name for speaker ${segment.speaker + 1}`}
                        value={
                          segment.speaker_name ||
                          `Speaker ${segment.speaker + 1}`
                        }
                        onChange={(event) =>
                          renameSpeaker(
                            segment.speaker as number,
                            event.target.value,
                          )
                        }
                        onBlur={() => void save()}
                      />
                    )}
                  <Textarea
                    aria-label={`Segment at ${time(segment.start)}`}
                    rows={1}
                    ref={(element) => {
                      if (element) {
                        element.style.height = "0px";
                        element.style.height = `${element.scrollHeight + 2}px`;
                      }
                    }}
                    value={segment.text}
                    onChange={(event) =>
                      updateSegment(segment.id, event.target.value)
                    }
                    onBlur={() => void save()}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <div className="blank">
            <p>No speech found.</p>
            {initial.source_available && (
              <Button disabled={retrying} onClick={() => void retry()}>
                {retrying ? "Retrying…" : "Retry transcription"}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="editor-foot">
        <label htmlFor="delete-scope">Delete</label>
        <AppSelect
          id="delete-scope"
          size="sm"
          value={scope}
          onValueChange={setScope}
          options={[
            { value: "transcript", label: "Transcript only" },
            { value: "all", label: "Everything" },
          ]}
        />
        <DeleteButton className="model-delete" onConfirm={remove} />
      </div>
    </section>
  );
}
