import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import MatrixOrb from "@/components/ui/matrix-orb";
import { LanguageCombobox } from "@/components/language-combobox";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button, ProgressBar } from "@/components/ui";
import { useStudio } from "@/components/studio-context";
import { api, bytes } from "@/lib/api";
import { presetLabel } from "@/lib/models";
import type { Settings } from "@/lib/types";

export const Route = createFileRoute("/welcome")({
  component: Welcome,
  head: () => ({ meta: [{ title: "Set up your studio · Whisper Studio" }] }),
});

function Welcome() {
  const { environment, settings, setSettings, refreshEnvironment } =
    useStudio();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [preset, setPreset] = useState<Settings["preset"]>(settings.preset);
  const [language, setLanguage] = useState(settings.language);
  const [retain, setRetain] = useState(settings.retain_source);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const title = useRef<HTMLHeadingElement>(null);
  const selected = environment.models.find(
    (item) => item.id === environment.presets[preset]?.model,
  );
  const ready =
    !!selected?.installed && !!environment.ffmpeg && environment.database;
  const headings = [
    "Welcome to Whisper Studio",
    "Choose a transcription model",
    "Choose your defaults",
  ];

  useEffect(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("whisper:setup-draft") || "null",
      );
      if (saved) {
        if ([0, 1, 2].includes(saved.step)) setStep(saved.step);
        if (["fast", "balanced", "accurate"].includes(saved.preset))
          setPreset(saved.preset);
        if (
          saved.language === "auto" ||
          environment.languages.includes(saved.language)
        )
          setLanguage(saved.language);
        if (typeof saved.retain === "boolean") setRetain(saved.retain);
      }
    } catch {
      sessionStorage.removeItem("whisper:setup-draft");
    }
    // Restore once; environment polling must not reset in-progress choices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [step]);

  function go(next: number) {
    sessionStorage.setItem(
      "whisper:setup-draft",
      JSON.stringify({ step: next, preset, language, retain }),
    );
    setError("");
    setStep(next);
  }

  async function download() {
    if (!selected || selected.downloading || pending) return;
    setPending(true);
    setError("");
    sessionStorage.setItem(
      "whisper:setup-draft",
      JSON.stringify({ step: 1, preset, language, retain }),
    );
    try {
      await api(`/models/${encodeURIComponent(selected.id)}`, {
        method: "POST",
        body: JSON.stringify({ confirm: true }),
      });
      await refreshEnvironment();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function finish() {
    if (!ready || pending) return;
    setPending(true);
    setError("");
    try {
      const value = await api<Settings>("/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...settings,
          preset,
          language,
          retain_source: retain,
          onboarding_completed: true,
        }),
      });
      setSettings(value);
      sessionStorage.removeItem("whisper:setup-draft");
      sessionStorage.removeItem("whisper:setup-skipped");
      await navigate({ to: "/" });
    } catch (reason) {
      setError((reason as Error).message);
      setPending(false);
    }
  }

  return (
    <div className="welcome-page" data-step={step}>
      <aside className="welcome-sidebar">
        <div className="welcome-app-identity">
          <img src="/static/mark.svg" alt="" width="48" height="48" />
          <div>
            <strong>Whisper Studio</strong>
            <span>Initial setup</span>
          </div>
        </div>
        <nav aria-label="Setup progress">
          <ol className="welcome-steps" aria-label="Setup progress">
            {["Welcome", "Transcription model", "Defaults"].map(
              (label, index) => (
                <li
                  key={label}
                  aria-current={step === index ? "step" : undefined}
                  data-complete={index < step}
                >
                  <span aria-hidden="true">
                    {index < step ? (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        size={14}
                        aria-hidden="true"
                      />
                    ) : (
                      `0${index + 1}`
                    )}
                  </span>
                  {label}
                </li>
              ),
            )}
          </ol>
        </nav>
        <p className="welcome-privacy">
          Audio and transcripts stay on this Mac.
        </p>
      </aside>
      <div className="welcome-main">
        <header className="welcome-toolbar">
          <span>
            Step {step + 1} of {headings.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              sessionStorage.setItem("whisper:setup-skipped", "1");
              void navigate({ to: "/" });
            }}
          >
            Set up later
          </Button>
        </header>
        <section className="welcome-content">
          <div className="welcome-content-scroll">
            <div className="welcome-orb" aria-hidden="true">
              <MatrixOrb
                size={116}
                dots={11}
                color="#d87e5f"
                state={
                  selected?.downloading
                    ? "thinking"
                    : step === 2
                      ? "listening"
                      : "idle"
                }
                labels={{ idle: "", thinking: "", listening: "" }}
              />
            </div>
            <h1 ref={title} tabIndex={-1}>
              {headings[step]}
            </h1>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, y: reduced ? 0 : 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.18 }}
              >
                {step === 0 && (
                  <div className="welcome-intro">
                    <p>
                      Turn recordings into editable transcripts privately on
                      this Mac.
                    </p>
                    <div className="welcome-capabilities">
                      {[
                        "Process recordings on-device",
                        "Edit and search every transcript",
                        "Export in common document formats",
                      ].map((capability) => (
                        <span key={capability}>
                          <HugeiconsIcon icon={Tick02Icon} size={14} />
                          {capability}
                        </span>
                      ))}
                    </div>
                    <p className="welcome-note">
                      Setup downloads one transcription model for offline use.
                    </p>
                  </div>
                )}
                {step === 1 && (
                  <div className="welcome-models">
                    <p className="welcome-description">
                      Choose your balance of speed and accuracy.
                    </p>
                    <FieldSet>
                      <FieldLegend className="visually-hidden">
                        Transcription quality
                      </FieldLegend>
                      <RadioGroup
                        value={preset}
                        onValueChange={(value) => {
                          setPreset(String(value) as Settings["preset"]);
                          setError("");
                        }}
                        aria-label="Transcription quality"
                      >
                        {Object.entries(environment.presets).map(
                          ([key, value]) => {
                            const model = environment.models.find(
                              (item) => item.id === value.model,
                            );
                            return (
                              <label
                                className="welcome-model"
                                key={key}
                                data-selected={preset === key}
                              >
                                <RadioGroupItem
                                  value={key}
                                  disabled={pending}
                                />
                                <span>
                                  <strong>
                                    {presetLabel(key)}{" "}
                                    {key === "balanced" && (
                                      <small>Recommended</small>
                                    )}
                                  </strong>
                                  <span>
                                    {value.memory} memory ·{" "}
                                    {model?.estimate ||
                                      "Download size unavailable"}
                                  </span>
                                </span>
                                <span className="welcome-model-state">
                                  {model?.installed
                                    ? "Ready"
                                    : model?.downloading
                                      ? "Installing"
                                      : ""}
                                </span>
                              </label>
                            );
                          },
                        )}
                      </RadioGroup>
                    </FieldSet>
                    {selected?.downloading && (
                      <div className="welcome-download" role="status">
                        <span>
                          {selected.phase === "verifying"
                            ? "Verifying model…"
                            : "Downloading model…"}
                        </span>
                        <ProgressBar
                          value={selected.progress}
                          label="Model download progress"
                        />
                        <small>
                          {bytes(selected.downloaded_bytes)}
                          {selected.total_bytes
                            ? ` / ${bytes(selected.total_bytes)}`
                            : ""}
                        </small>
                      </div>
                    )}
                    {selected?.error && (
                      <p className="welcome-error" role="alert">
                        {selected.error}
                      </p>
                    )}
                    {!selected?.installed && !selected?.downloading && (
                      <p className="welcome-note">
                        Downloads {selected?.estimate || "the selected model"}{" "}
                        from Hugging Face to this Mac.
                      </p>
                    )}
                  </div>
                )}
                {step === 2 && (
                  <div className="welcome-preferences">
                    <Field>
                      <FieldLabel htmlFor="welcome-language">
                        Recording language
                      </FieldLabel>
                      <LanguageCombobox
                        id="welcome-language"
                        value={language}
                        languages={environment.languages}
                        onValueChange={setLanguage}
                      />
                    </Field>
                    <label className="welcome-retention">
                      <Checkbox
                        checked={retain}
                        onCheckedChange={(value) => setRetain(value === true)}
                      />
                      <span>
                        Keep original recordings
                        <small>Save a copy in your library.</small>
                      </span>
                    </label>
                    <div className="welcome-ready">
                      <span aria-hidden="true">
                        <HugeiconsIcon icon={Tick02Icon} size={20} />
                      </span>
                      <span>
                        {presetLabel(preset)} model{" "}
                        {selected?.installed ? "is ready" : "is not installed"}
                        <small>
                          Your recordings are processed on this Mac.
                        </small>
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            {step > 0 && (!environment.ffmpeg || !environment.database) && (
              <div className="welcome-error" role="alert">
                <p>
                  {!environment.ffmpeg
                    ? "FFmpeg is missing. Install it, then check again."
                    : "The local database needs attention."}
                </p>
                {!environment.ffmpeg && <code>brew install ffmpeg</code>}
                <Button
                  variant="outline"
                  onClick={() =>
                    void refreshEnvironment().catch((reason) =>
                      setError(reason.message),
                    )
                  }
                >
                  Check again
                </Button>
                <Link to="/settings">
                  Open settings{" "}
                  <HugeiconsIcon
                    icon={ArrowUpRight01Icon}
                    size={16}
                    aria-hidden="true"
                  />
                </Link>
              </div>
            )}
            {error && (
              <p className="welcome-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
        <footer className="welcome-actions">
          {step > 0 && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => go(step - 1)}
            >
              Back
            </Button>
          )}
          {step === 0 ? (
            <Button onClick={() => go(1)}>Continue</Button>
          ) : step === 1 ? (
            selected?.installed ? (
              <Button disabled={!ready} onClick={() => go(2)}>
                Continue
              </Button>
            ) : (
              <Button
                disabled={pending || !!selected?.downloading || !selected}
                onClick={() => void download()}
              >
                {pending || selected?.downloading
                  ? "Installing…"
                  : selected?.error
                    ? "Retry download"
                    : "Download model"}
              </Button>
            )
          ) : (
            <Button disabled={!ready || pending} onClick={() => void finish()}>
              {pending ? "Saving…" : "Done"}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
