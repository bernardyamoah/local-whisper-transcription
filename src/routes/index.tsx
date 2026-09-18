import MatrixOrb from "@/components/ui/matrix-orb";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight01Icon,
  BookmarkAdd02Icon,
  FileAudioIcon,
  Mic01Icon,
  StopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { LanguageCombobox } from "@/components/language-combobox";
import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useStudio } from "../components/studio-context";
import { Button, PageHeader, ProgressBar } from "../components/ui";
import { api, bytes, time } from "../lib/api";
import { isRecommendedModel, presetLabel } from "../lib/models";
import {
  prepareSystemNotifications,
  trackTranscription,
} from "../lib/system-notifications";
import type {
  Bookmark,
  Job,
  Media,
  MeetingTemplate,
  RecordingStatus,
} from "../lib/types";

export const Route = createFileRoute("/")({ component: NewTranscription });

function NewTranscription() {
  const { environment, settings, notice } = useStudio();
  const navigate = useNavigate();
  const [media, setMedia] = useState<Media | null>(null);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState(settings.language);
  const [provider, setProvider] = useState<"local" | "deepgram">(
    settings.transcription_provider,
  );
  const [quality, setQuality] = useState(settings.preset);
  const [meetingTemplate, setMeetingTemplate] =
    useState<MeetingTemplate["id"]>("general");
  const [model, setModel] = useState(() => {
    const preferred = environment.presets[settings.preset].model;
    return environment.models.some(
      (item) =>
        item.id === preferred && item.installed && isRecommendedModel(item.id),
    )
      ? preferred
      : "";
  });
  const [upload, setUpload] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [animateOptions, setAnimateOptions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState<RecordingStatus>({
    state: "idle",
  });
  const [recordingBookmarks, setRecordingBookmarks] = useState<Bookmark[]>([]);
  const reduced = useReducedMotion();
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  useEffect(() => {
    const retained = sessionStorage.getItem("reuse-media");
    if (retained) {
      const value = JSON.parse(retained) as Media;
      sessionStorage.removeItem("reuse-media");
      setMedia(value);
      setTitle(value.name.replace(/\.[^.]+$/, ""));
    }
  }, [notice]);

  useEffect(() => {
    if (!environment.native.recording) return;
    void api<RecordingStatus>("/recordings")
      .then((value) => {
        setRecording(value);
        setRecordingBookmarks(value.bookmarks || []);
        if (value.template) setMeetingTemplate(value.template);
      })
      .catch(() => undefined);
  }, [environment.native.recording]);

  useEffect(() => {
    if (recording.state !== "recording") return;
    const timer = window.setInterval(() => {
      setRecording((current) =>
        current.state === "recording"
          ? { ...current, elapsed: (current.elapsed || 0) + 1 }
          : current,
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording.state]);

  useEffect(() => {
    if (recording.state !== "recording") return;
    const refresh = () =>
      void api<RecordingStatus>("/recordings")
        .then((value) => {
          setRecording((current) => ({
            ...value,
            elapsed: Math.max(current.elapsed || 0, value.elapsed || 0),
          }));
          setRecordingBookmarks(value.bookmarks || []);
        })
        .catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 700);
    return () => window.clearInterval(timer);
  }, [recording.state]);

  const needsSetup =
    !settings.onboarding_completed &&
    !environment.models.some(
      (item) => item.installed && isRecommendedModel(item.id),
    ) &&
    !sessionStorage.getItem("whisper:setup-skipped");
  useEffect(() => {
    if (needsSetup) void navigate({ to: "/welcome", replace: true });
  }, [needsSetup, navigate]);

  const installed = environment.models.filter(
    (item) => item.installed && isRecommendedModel(item.id),
  );
  const canStart =
    !!media &&
    (provider === "deepgram"
      ? environment.deepgram.configured
      : !!model && installed.some((item) => item.id === model)) &&
    !!environment.ffmpeg &&
    !busy;

  function chooseQuality(value: string) {
    setQuality(value as typeof quality);
    const mapped = environment.presets[value].model;
    if (installed.some((item) => item.id === mapped)) setModel(mapped);
  }

  function uploadFile(file?: File) {
    if (!file || busy || recording.state === "recording") return;
    setBusy(true);
    setUpload(0);
    setUploadStatus("Uploading…");
    notice("");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.setRequestHeader("X-Studio-Request", "1");
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      setUpload((event.loaded / event.total) * 100);
      if (event.loaded === event.total) setUploadStatus("Checking audio…");
    };
    xhr.onload = () => {
      setBusy(false);
      setUpload(null);
      setUploadStatus("");
      if (xhr.status >= 200 && xhr.status < 300) {
        const value = JSON.parse(xhr.responseText) as Media;
        setMedia(value);
        setTitle(value.name.replace(/\.[^.]+$/, ""));
        setUpload(null);
        notice({
          title: "Recording ready",
        });
      } else {
        const payload = JSON.parse(xhr.responseText || "null");
        notice(payload?.detail || "Upload failed.", true);
      }
    };
    xhr.onerror = () => {
      setBusy(false);
      setUpload(null);
      setUploadStatus("");
      notice("The upload was interrupted.", true);
    };
    xhr.send(file);
  }

  async function startRecording() {
    setBusy(true);
    notice("");
    try {
      const value = await api<RecordingStatus>("/recordings", {
        method: "POST",
        body: JSON.stringify({
          name: title.trim() || "Meeting recording",
          language,
          template: meetingTemplate,
        }),
      });
      setRecordingBookmarks([]);
      setRecording(value);
    } catch (reason) {
      notice((reason as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function addRecordingBookmark(kind: string) {
    try {
      const bookmark = await api<Bookmark>("/recordings/bookmarks", {
        method: "POST",
        body: JSON.stringify({ kind }),
      });
      setRecordingBookmarks((current) => [...current, bookmark]);
    } catch (reason) {
      notice((reason as Error).message, true);
    }
  }

  async function stopRecording() {
    setBusy(true);
    try {
      const value = await api<Media>("/recordings/stop", { method: "POST" });
      setMedia(value);
      setTitle(value.name.replace(/\.[^.]+$/, ""));
      setRecording({ state: "idle" });
      notice({ title: "Recording ready" });
    } catch (reason) {
      notice((reason as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!media) return;
    setBusy(true);
    void prepareSystemNotifications();
    try {
      const created = await api<Job>("/jobs", {
        method: "POST",
        body: JSON.stringify({
          media_id: media.id,
          title,
          language,
          preset: quality,
          model,
          provider,
          template: meetingTemplate,
        }),
      });
      trackTranscription(created);
      notice({
        title: "Transcription started",
        description:
          created.provider === "deepgram"
            ? `${created.title} is being transcribed with Deepgram.`
            : `${created.title} is being processed locally on this Mac.`,
        kind: "info",
      });
      await navigate({ to: "/jobs/$jobId", params: { jobId: created.id } });
    } catch (reason) {
      notice((reason as Error).message, true);
      setBusy(false);
    }
  }

  if (needsSetup) return <p className="loading">Opening setup…</p>;
  return (
    <section className="capture-page">
      <PageHeader
        title="New transcription"
        action={
          <Link to="/library" className="capture-library-link">
            Library <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />
          </Link>
        }
      />
      <motion.div
        className="upload-workspace"
        initial={{ opacity: 0, y: reduced ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.35, ease: "easeOut" }}
      >
        <div className="upload-panel">
          <div
            className="capture-stage"
            data-dragging={dragging}
            data-recording={recording.state === "recording"}
            aria-busy={busy}
            onDragEnter={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              dragDepth.current += 1;
              if (!busy && recording.state !== "recording") setDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (!dragDepth.current) setDragging(false);
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              event.dataTransfer.dropEffect =
                busy || recording.state === "recording" ? "none" : "copy";
            }}
            onDrop={(event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              uploadFile(event.dataTransfer.files[0]);
            }}
          >
            <motion.div
              className="capture-orb"
              aria-hidden="true"
              animate={{ scale: dragging ? 1.08 : 1, y: media ? -8 : 0 }}
              transition={{ duration: reduced ? 0 : 0.3, ease: "easeOut" }}
            >
              <MatrixOrb
                state={
                  recording.state === "recording"
                    ? "listening"
                    : busy
                      ? "thinking"
                      : dragging
                        ? "listening"
                        : "idle"
                }
                size={220}
                color="#d87e5f"
                labels={{ idle: "", listening: "", thinking: "" }}
              />
            </motion.div>
            <AnimatePresence mode="wait" initial={false}>
              {recording.state === "recording" ? (
                <motion.div
                  key="recording"
                  className="recording-session"
                  initial={{ opacity: 0, y: reduced ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduced ? 0 : -8 }}
                  transition={{ duration: reduced ? 0 : 0.2 }}
                >
                  <span className="recording-live">
                    <span aria-hidden="true" /> Recording
                  </span>
                  <strong>{time(recording.elapsed)}</strong>
                  <div className="live-transcript" aria-live="polite">
                    <div className="live-transcript-heading">
                      <span>Live transcript</span>
                      <small>
                        {recording.live_transcript?.length
                          ? "Listening"
                          : "Waiting for speech"}
                      </small>
                    </div>
                    <div className="live-transcript-feed">
                      {recording.live_transcript?.length ? (
                        recording.live_transcript.slice(-4).map((item) => (
                          <p
                            key={`${item.source}-${item.start}-${item.text}`}
                            data-final={item.final}
                          >
                            <span>{item.source}</span>
                            {item.text}
                          </p>
                        ))
                      ) : (
                        <p className="live-transcript-empty">
                          The transcript will appear here.
                        </p>
                      )}
                    </div>
                    {recording.live_error && (
                      <p className="live-transcript-error">
                        Live text unavailable. Recording continues.
                      </p>
                    )}
                  </div>
                  <div
                    className="recording-bookmarks"
                    aria-label="Add bookmark"
                  >
                    {environment.meeting_templates
                      .find((item) => item.id === meetingTemplate)
                      ?.bookmarks.map((kind) => (
                        <Button
                          key={kind}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void addRecordingBookmark(kind)}
                        >
                          <HugeiconsIcon
                            icon={BookmarkAdd02Icon}
                            size={14}
                            strokeWidth={1.8}
                          />
                          {kind}
                        </Button>
                      ))}
                  </div>
                  {!!recordingBookmarks.length && (
                    <span className="recording-bookmark-count">
                      {recordingBookmarks.length}{" "}
                      {recordingBookmarks.length === 1
                        ? "bookmark"
                        : "bookmarks"}
                    </span>
                  )}
                  <Button
                    type="button"
                    className="stop-recording-button"
                    disabled={busy}
                    onClick={stopRecording}
                  >
                    <HugeiconsIcon icon={StopIcon} size={17} strokeWidth={2} />
                    Stop recording
                  </Button>
                </motion.div>
              ) : media ? (
                <motion.div
                  key="preview"
                  className="file-preview"
                  exit={{ opacity: 0, y: reduced ? 0 : -5 }}
                  initial={{ opacity: 0, y: reduced ? 0 : 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <span className="file-icon" aria-hidden="true">
                    <HugeiconsIcon
                      icon={FileAudioIcon}
                      size={20}
                      strokeWidth={1.7}
                    />
                  </span>
                  <label htmlFor="recording-title">Title</label>
                  <Input
                    id="recording-title"
                    type="text"
                    maxLength={200}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  <p>
                    {time(media.duration)} · {bytes(media.size)} · {media.codec}{" "}
                    audio
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-button"
                    disabled={busy}
                    onClick={() => setMedia(null)}
                  >
                    Replace recording
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="import"
                  className="dropzone"
                  initial={{ opacity: 0, y: reduced ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduced ? 0 : -8 }}
                  transition={{ duration: reduced ? 0 : 0.18 }}
                >
                  <h2>{dragging ? "Drop to import" : "Add recording"}</h2>
                  <Input
                    ref={input}
                    id="file-input"
                    type="file"
                    aria-label="Choose recording"
                    className="visually-hidden"
                    accept="audio/*,video/*,.mkv,.flac,.ogg,.m4a"
                    disabled={busy}
                    onChange={(event) => uploadFile(event.target.files?.[0])}
                  />
                  <div className="capture-actions">
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => input.current?.click()}
                    >
                      Choose file
                    </Button>
                    {environment.native.recording && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={startRecording}
                      >
                        <HugeiconsIcon
                          icon={Mic01Icon}
                          size={17}
                          strokeWidth={1.8}
                        />
                        Record meeting
                      </Button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="capture-status" role="status">
              {dragging && media ? "Drop to replace" : uploadStatus}
              {upload !== null && (
                <ProgressBar value={upload} label="Upload progress" />
              )}
            </div>
          </div>
          <div className="capture-controls">
            <Button
              type="button"
              variant="ghost"
              className="capture-options-toggle"
              aria-expanded={optionsOpen}
              aria-controls="capture-options"
              onClick={(event) => {
                setAnimateOptions(event.detail !== 0);
                setOptionsOpen(!optionsOpen);
              }}
            >
              <span>Options</span>
              <span>
                {provider === "deepgram" ? "Deepgram" : presetLabel(quality)} ·{" "}
                {language === "auto" ? "Auto language" : language.toUpperCase()}
              </span>
              <span aria-hidden="true">{optionsOpen ? "−" : "+"}</span>
            </Button>
            <AnimatePresence initial={false}>
              {optionsOpen && (
                <motion.div
                  id="capture-options"
                  key="options"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: reduced || !animateOptions ? 0 : 0.24,
                    ease: "easeOut",
                  }}
                  className="capture-options-content"
                >
                  <div className="configuration">
                    <Field className="field provider-field">
                      <FieldLabel htmlFor="provider">Transcription</FieldLabel>
                      <AppSelect
                        id="provider"
                        value={provider}
                        onValueChange={(value) =>
                          setProvider(value as "local" | "deepgram")
                        }
                        options={[
                          { value: "local", label: "On this Mac" },
                          {
                            value: "deepgram",
                            label: environment.deepgram.configured
                              ? "Deepgram"
                              : "Deepgram · connect first",
                          },
                        ]}
                      />
                    </Field>
                    <Field className="field language-field">
                      <FieldLabel htmlFor="language">
                        Recording language
                      </FieldLabel>
                      <LanguageCombobox
                        id="language"
                        value={language}
                        languages={environment.languages}
                        onValueChange={setLanguage}
                      />
                    </Field>
                    <Field className="field template-field">
                      <FieldLabel htmlFor="meeting-template">
                        Meeting template
                      </FieldLabel>
                      <AppSelect
                        id="meeting-template"
                        value={meetingTemplate}
                        onValueChange={(value) =>
                          setMeetingTemplate(value as MeetingTemplate["id"])
                        }
                        options={environment.meeting_templates.map((item) => ({
                          value: item.id,
                          label: item.name,
                        }))}
                      />
                    </Field>
                    {provider === "local" && (
                      <>
                        <FieldSet className="field quality-field">
                          <FieldLegend variant="label" id="quality-label">
                            Quality
                          </FieldLegend>
                          <RadioGroup
                            className="quality-options"
                            aria-labelledby="quality-label"
                            value={quality}
                            onValueChange={(value) =>
                              chooseQuality(String(value))
                            }
                          >
                            {Object.entries(environment.presets).map(
                              ([key, preset]) => (
                                <div className="quality" key={key}>
                                  <RadioGroupItem
                                    id={`quality-${key}`}
                                    value={key}
                                  />
                                  <label htmlFor={`quality-${key}`}>
                                    {presetLabel(key)}
                                    <small>{preset.memory} memory</small>
                                  </label>
                                </div>
                              ),
                            )}
                          </RadioGroup>
                        </FieldSet>
                        <Field className="field model-field">
                          <FieldLabel htmlFor="model">Model</FieldLabel>
                          <AppSelect
                            id="model"
                            value={model}
                            onValueChange={setModel}
                            options={installed.map((item) => ({
                              value: item.id,
                              label: item.name,
                            }))}
                          />
                        </Field>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="configuration-bottom">
              <p className="helper">
                {!environment.ffmpeg ? (
                  "Install FFmpeg to transcribe."
                ) : provider === "deepgram" &&
                  !environment.deepgram.configured ? (
                  <Link to="/settings">Connect Deepgram in Settings</Link>
                ) : provider === "local" && !model ? (
                  <Link to="/settings">Install a model in Settings</Link>
                ) : (
                  ""
                )}
              </p>
              {media && (
                <Button id="start-button" disabled={!canStart} onClick={start}>
                  Start transcription
                  <HugeiconsIcon
                    icon={ArrowUpRight01Icon}
                    size={16}
                    strokeWidth={1.8}
                  />
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
