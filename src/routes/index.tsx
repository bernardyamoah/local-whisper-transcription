import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useStudio } from "../components/studio-context";
import {
  Button,
  FadeIn,
  HistoryRow,
  PageHeader,
  ProgressBar,
} from "../components/ui";
import { api, bytes, time, titleCase } from "../lib/api";
import type { Job, Media } from "../lib/types";

export const Route = createFileRoute("/")({ component: NewTranscription });

function NewTranscription() {
  const { environment, settings, notice } = useStudio();
  const navigate = useNavigate();
  const [media, setMedia] = useState<Media | null>(null);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState(settings.language);
  const [quality, setQuality] = useState(settings.preset);
  const [model, setModel] = useState(
    environment.presets[settings.preset].model,
  );
  const [upload, setUpload] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [recent, setRecent] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const reduced = useReducedMotion();
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const names = useMemo(
    () => new Intl.DisplayNames(["en"], { type: "language" }),
    [],
  );

  useEffect(() => {
    const retained = sessionStorage.getItem("reuse-media");
    if (retained) {
      const value = JSON.parse(retained) as Media;
      sessionStorage.removeItem("reuse-media");
      setMedia(value);
      setTitle(value.name.replace(/\.[^.]+$/, ""));
    }
    api<{ items: Job[] }>("/jobs?limit=3")
      .then((data) => setRecent(data.items))
      .catch((reason: Error) => notice(reason.message, true));
  }, [notice]);

  const installed = environment.models.filter((item) => item.installed);
  const canStart = !!media && !!model && !!environment.ffmpeg && !busy;

  function chooseQuality(value: string) {
    setQuality(value as typeof quality);
    const mapped = environment.presets[value].model;
    if (installed.some((item) => item.id === mapped)) setModel(mapped);
  }

  function uploadFile(file?: File) {
    if (!file || busy) return;
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

  async function start() {
    if (!media) return;
    setBusy(true);
    try {
      const created = await api<Job>("/jobs", {
        method: "POST",
        body: JSON.stringify({
          media_id: media.id,
          title,
          language,
          preset: quality,
          model,
        }),
      });
      await navigate({ to: "/jobs/$jobId", params: { jobId: created.id } });
    } catch (reason) {
      notice((reason as Error).message, true);
      setBusy(false);
    }
  }

  return (
    <section className="capture-page">
      <PageHeader title="New transcription" />
      <div className="upload-workspace">
        <div className="upload-panel">
          <div
            className="capture-stage"
            data-dragging={dragging}
            aria-busy={busy}
            onDragEnter={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              dragDepth.current += 1;
              if (!busy) setDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (!dragDepth.current) setDragging(false);
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = busy ? "none" : "copy";
            }}
            onDrop={(event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              uploadFile(event.dataTransfer.files[0]);
            }}
          >
            <div className="capture-wave" aria-hidden="true">
              {Array.from({ length: 49 }, (_, i) => (
                <span
                  key={i}
                  style={{
                    height:
                      12 +
                      Math.pow(Math.sin(i * 0.71), 2) *
                        (1 - Math.abs(i - 24) / 28) *
                        104 +
                      "px",
                    animationDelay: i * -0.09 + "s",
                  }}
                />
              ))}
            </div>
            {media ? (
              <motion.div
                className="file-preview"
                initial={{ opacity: 0, y: reduced ? 0 : 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                <span className="file-icon" aria-hidden="true">
                  ≋
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
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setMedia(null)}
                >
                  Replace recording
                </button>
              </motion.div>
            ) : (
              <div className="dropzone">
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
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                >
                  Choose file
                </Button>
              </div>
            )}
            <div className="capture-status" role="status">
              {dragging ? "Drop to import" : uploadStatus}
              {upload !== null && (
                <ProgressBar value={upload} label="Upload progress" />
              )}
            </div>
          </div>
          <div className="configuration">
            <div className="field">
              <label htmlFor="language">Recording language</label>
              <NativeSelect
                id="language"
                className="w-full"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <NativeSelectOption value="auto">
                  Detect automatically
                </NativeSelectOption>
                {[...environment.languages]
                  .sort((a, b) =>
                    (names.of(a) || a).localeCompare(names.of(b) || b),
                  )
                  .map((code) => (
                    <NativeSelectOption key={code} value={code}>
                      {names.of(code)}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </div>
            <div className="field">
              <span className="label" id="quality-label">
                Quality
              </span>
              <RadioGroup
                className="quality-options"
                aria-labelledby="quality-label"
                value={quality}
                onValueChange={(value) => chooseQuality(String(value))}
              >
                {Object.entries(environment.presets).map(([key, preset]) => (
                  <div className="quality" key={key}>
                    <RadioGroupItem id={`quality-${key}`} value={key} />
                    <label htmlFor={`quality-${key}`}>
                      {titleCase(key)}
                      <small>{preset.memory} memory</small>
                    </label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="field">
              <label htmlFor="model">Model</label>
              <NativeSelect
                id="model"
                className="w-full"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              >
                {installed.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="configuration-bottom">
              <p className="helper">
                {!environment.ffmpeg ? (
                  "Install FFmpeg to transcribe."
                ) : !model ? (
                  <Link to="/settings">Install a model in Settings</Link>
                ) : (
                  ""
                )}
              </p>
              <Button id="start-button" disabled={!canStart} onClick={start}>
                Start transcription ↗
              </Button>
            </div>
          </div>
        </div>
      </div>
      <FadeIn>
        <div className="recent">
          <div className="section-heading">
            <h2>Recent transcriptions</h2>
            <Link to="/library">Open library ↗</Link>
          </div>
          {recent.length ? (
            recent.map((item) => <HistoryRow job={item} key={item.id} />)
          ) : (
            <p className="empty-inline">No transcriptions yet.</p>
          )}
        </div>
      </FadeIn>
    </section>
  );
}
