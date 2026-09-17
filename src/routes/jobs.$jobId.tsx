import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown02Icon,
  ArrowUp02Icon,
  ArrowUpRight01Icon,
  Download02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteButton } from "@/components/ui/delete-button";
import { Input } from "@/components/ui/input";
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
import type { Job, Segment } from "../lib/types";

export const Route = createFileRoute("/jobs/$jobId")({ component: JobPage });

function JobPage() {
  const { jobId } = Route.useParams();
  const { notice } = useStudio();
  const [job, setJob] = useState<Job>();
  const load = useCallback(async () => {
    try {
      setJob(await api<Job>(`/jobs/${jobId}`));
    } catch (reason) {
      notice((reason as Error).message, true);
    }
  }, [jobId, notice]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!job || job.state === "completed") return;
    const timer = window.setInterval(() => void load(), 2000);
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
          <div className="processing-wave" aria-hidden="true">
            {Array.from({ length: 53 }, (_, i) => (
              <span
                key={i}
                style={{
                  height:
                    10 +
                    Math.pow(Math.sin(i * 0.22), 2) *
                      (1 - Math.abs(i - 26) / 32) *
                      120 +
                    "px",
                  animationDelay: i * -0.075 + "s",
                }}
              />
            ))}
          </div>
          <div className="processing-percentage" aria-hidden="true">
            {Math.round(job.progress)}
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
                    await api(`/jobs/${job.id}/retry`, { method: "POST" });
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
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [ended, setEnded] = useState(false);
  const [follow, setFollow] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [active, setActive] = useState<number>();
  const [scope, setScope] = useState("all");
  const [retrying, setRetrying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const revision = useRef(initial.revision);
  const pending = useRef<Map<number, string>>(new Map());
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
    if (!pending.current.size && pendingTitle.current === null) return;
    const changes = [...pending.current].map(([id, text]) => ({ id, text }));
    const nextTitle = pendingTitle.current;
    pending.current.clear();
    pendingTitle.current = null;
    setSaveStatus("Saving…");
    saving.current = api<{ revision: number }>(`/jobs/${initial.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        revision: revision.current,
        segments: changes,
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
    if (audio.current) audio.current.playbackRate = speed;
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

  function playAudio() {
    void audio.current?.play().catch((reason: DOMException) => {
      if (reason.name !== "AbortError") notice(reason.message, true);
    });
  }

  async function remove() {
    await save();
    try {
      await api(`/jobs/${initial.id}`, {
        method: "DELETE",
        body: JSON.stringify({ scope, confirm: true }),
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
      window.location.reload();
    } catch (reason) {
      setRetrying(false);
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
              notice("Copied.");
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
            onClick={async () => {
              await save();
              const link = document.createElement("a");
              link.href = `/api/jobs/${initial.id}/export/${format}`;
              link.click();
            }}
          >
            Export
            <HugeiconsIcon icon={Download02Icon} size={15} strokeWidth={1.8} />
          </Button>
        </div>
      )}
      <div className="player">
        {initial.playback_available ? (
          <>
            <div className="player-transport">
              <StepPlayer
                className="rare-audio-player"
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
                  if (!audio.current || !segment) return;
                  setEnded(false);
                  audio.current.currentTime = segment.start;
                  setPlaybackTime(segment.start);
                  setActive(segment.id);
                }}
                onPlayingChange={(next) => {
                  if (!audio.current) return;
                  if (next) playAudio();
                  else audio.current.pause();
                }}
              />
              <span className="player-clock">
                {time(playbackTime)} <span>/ {time(initial.duration)}</span>
              </span>
            </div>
            <label className="visually-hidden" htmlFor="audio-seek">
              Seek recording
            </label>
            <input
              id="audio-seek"
              className="audio-seek"
              type="range"
              min="0"
              max={initial.duration || 1}
              step="0.1"
              value={Math.min(playbackTime, initial.duration)}
              aria-valuetext={time(playbackTime)}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (audio.current) audio.current.currentTime = value;
                setEnded(false);
                setPlaybackTime(value);
              }}
            />
            <div className="player-options">
              <label className="volume-control">
                Volume
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setVolume(value);
                    if (audio.current) audio.current.volume = value;
                  }}
                />
              </label>
              <audio
                ref={audio}
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
                onTimeUpdate={(event) => {
                  setPlaybackTime(event.currentTarget.currentTime);
                  const current = segments.find(
                    (segment) =>
                      segment.start <= event.currentTarget.currentTime &&
                      event.currentTarget.currentTime < segment.end,
                  )?.id;
                  setActive(current);
                  if (follow && current !== undefined && current !== active)
                    document
                      .querySelector(`[data-segment="${current}"]`)
                      ?.scrollIntoView({ block: "center" });
                }}
              />
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
      {!!segments.length && (
        <label className="toggle-row">
          <Checkbox
            checked={follow}
            onCheckedChange={(checked) => setFollow(checked === true)}
          />{" "}
          Follow playback
        </label>
      )}
      <div className="transcript">
        {segments.length ? (
          segments.map((segment) => (
            <div
              key={segment.id}
              data-segment={segment.id}
              className={`segment ${active === segment.id ? "active" : ""} ${matches.includes(segment.id) ? "match" : ""} ${selectedMatch === segment.id ? "selected-match" : ""}`}
            >
              <button
                className="timestamp"
                disabled={!initial.playback_available}
                aria-label={`Play from ${time(segment.start)}`}
                onClick={() => {
                  if (audio.current) {
                    setEnded(false);
                    audio.current.currentTime = segment.start;
                    playAudio();
                  }
                }}
              >
                {time(segment.start)}
              </button>
              <Textarea
                aria-label={`Segment at ${time(segment.start)}`}
                rows={2}
                value={segment.text}
                onChange={(event) =>
                  updateSegment(segment.id, event.target.value)
                }
                onBlur={() => void save()}
              />
            </div>
          ))
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
