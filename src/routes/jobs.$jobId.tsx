import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  const [action, setAction] = useState<"cancel" | "delete" | null>(null);
  const active = [
    "queued",
    "preparing",
    "transcribing",
    "saving",
    "cancelling",
  ].includes(job.state);

  async function close(accepted: boolean) {
    setConfirm(null);
    if (!accepted || !action) return;
    try {
      if (action === "cancel") {
        await api(`/jobs/${job.id}/cancel`, { method: "POST" });
        await reload();
      } else {
        await api(`/jobs/${job.id}`, {
          method: "DELETE",
          body: JSON.stringify({ scope: "all", confirm: true }),
        });
        await navigate({ to: "/library" });
      }
    } catch (reason) {
      notice((reason as Error).message, true);
    }
    setAction(null);
  }

  return (
    <section>
      <PageHeader
        title={job.title}
        subtitle={`${job.filename} · ${time(job.duration)} · ${titleCase(job.preset)}`}
      />
      <div className="progress-panel">
        <h2>{titleCase(job.state)}</h2>
        {job.error && <p>{job.error}</p>}
        <ProgressBar value={job.progress} label="Transcription progress" />
        <div className="progress-details">
          <span>
            {Math.round(job.progress)}% ·{" "}
            {job.backend?.toUpperCase() || "Local processing"}
          </span>
          <span>
            {job.started
              ? `${time((job.finished || Date.now() / 1000) - job.started)} elapsed`
              : "Waiting for worker"}
          </span>
        </div>
        <div className="stages">
          {["preparing", "transcribing", "saving"].map((stage, index) => (
            <span key={stage} className={stage === job.state ? "current" : ""}>
              {index > 0 && <span aria-hidden="true">· </span>}
              {titleCase(stage)}
            </span>
          ))}
        </div>
        {active ? (
          <Button
            variant="outline"
            disabled={job.state === "cancelling"}
            onClick={() => {
              setAction("cancel");
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
            Try again ↗
          </Button>
        )}{" "}
        <Link className={buttonVariants({ variant: "outline" })} to="/">
          Add another recording
        </Link>
        {!active && (
          <div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setAction("delete");
                setConfirm({
                  title: "Delete recording or transcript?",
                  description: "This cannot be undone.",
                  label: "Delete",
                  danger: true,
                });
              }}
            >
              Delete recording or transcript
            </Button>
          </div>
        )}
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
  const [follow, setFollow] = useState(true);
  const [active, setActive] = useState<number>();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [scope, setScope] = useState("all");
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

  async function remove(accepted: boolean) {
    setConfirm(null);
    if (!accepted) return;
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

  const selectedMatch = matches.length
    ? matches[Math.min(matchIndex, matches.length - 1)]
    : undefined;
  return (
    <section>
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
          ↑
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
          ↓
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
        <NativeSelect
          id="export-format"
          value={format}
          onChange={(event) => setFormat(event.target.value)}
        >
          <NativeSelectOption value="txt">TXT</NativeSelectOption>
          <NativeSelectOption value="srt">SRT</NativeSelectOption>
          <NativeSelectOption value="vtt">VTT</NativeSelectOption>
        </NativeSelect>
        <Button
          size="sm"
          onClick={async () => {
            await save();
            const link = document.createElement("a");
            link.href = `/api/jobs/${initial.id}/export/${format}`;
            link.click();
          }}
        >
          Export ↓
        </Button>
      </div>
      <div className="player">
        {initial.playback_available ? (
          <>
            <audio
              ref={audio}
              controls
              preload="metadata"
              src={`/api/jobs/${initial.id}/audio`}
              onTimeUpdate={(event) => {
                const current = segments.find(
                  (segment) =>
                    segment.start <= event.currentTarget.currentTime &&
                    event.currentTarget.currentTime < segment.end,
                )?.id;
                setActive(current);
                if (follow && current)
                  document
                    .querySelector(`[data-segment="${current}"]`)
                    ?.scrollIntoView({ block: "center" });
              }}
            />
            <label className="visually-hidden" htmlFor="speed">
              Playback speed
            </label>
            <NativeSelect
              id="speed"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            >
              {[0.75, 1, 1.25, 1.5, 2].map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}×
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </>
        ) : (
          <p className="helper">Recording removed. Playback unavailable.</p>
        )}
      </div>
      <label className="toggle-row">
        <Checkbox
          checked={follow}
          onCheckedChange={(checked) => setFollow(checked === true)}
        />{" "}
        Follow playback
      </label>
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
                    audio.current.currentTime = segment.start;
                    void audio.current.play();
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
          <div className="blank">No speech detected.</div>
        )}
      </div>
      <div className="editor-foot">
        <Button
          variant="destructive"
          size="sm"
          onClick={() =>
            setConfirm({
              title: "Delete transcription?",
              description: `Choose what to remove for “${title}”.`,
              label: "Delete selected items",
              danger: true,
              options: (
                <RadioGroup
                  id="dialog-options"
                  defaultValue={scope}
                  onValueChange={(value) => setScope(String(value))}
                >
                  <label>
                    <RadioGroupItem value="transcript" />
                    Delete transcript and playback audio; keep original
                    recording
                  </label>
                  <label>
                    <RadioGroupItem value="all" />
                    Delete transcript, playback audio, and original recording
                  </label>
                </RadioGroup>
              ),
            })
          }
        >
          Delete…
        </Button>
      </div>
      <ConfirmDialog
        request={confirm}
        onClose={(accepted) => void remove(accepted)}
      />
    </section>
  );
}
