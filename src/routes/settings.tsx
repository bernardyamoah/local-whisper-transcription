import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { AppSelect } from "@/components/app-select";
import { LanguageCombobox } from "@/components/language-combobox";
import { Badge } from "@/components/ui/badge";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteButton } from "@/components/ui/delete-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useStudio } from "../components/studio-context";
import {
  Button,
  ConfirmDialog,
  PageHeader,
  ProgressBar,
  type ConfirmRequest,
} from "../components/ui";
import { api, bytes, titleCase } from "../lib/api";
import { applyAppearance, type Appearance } from "../lib/appearance";
import {
  isRecommendedModel,
  presetLabel,
  RECOMMENDED_MODEL_IDS,
} from "../lib/models";
import {
  prepareSystemNotifications,
  trackModelDownload,
} from "../lib/system-notifications";
import type { Model, Settings } from "../lib/types";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const { environment, settings, setSettings, refreshEnvironment, notice } =
    useStudio();
  const [draft, setDraft] = useState(settings);
  const [query, setQuery] = useState("");
  const [deepgramKey, setDeepgramKey] = useState("");
  const [connectingDeepgram, setConnectingDeepgram] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [pendingAction, setPendingAction] = useState<
    null | (() => Promise<void>)
  >(null);
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const value = await api<Settings>("/settings", {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      setSettings(value);
      notice({
        title: "Preferences saved",
        description: "These defaults will be used for your next transcription.",
      });
    } catch (reason) {
      notice((reason as Error).message, true);
    }
  }

  async function changeAppearance(appearance: Appearance) {
    const previous = draft.appearance;
    const next = { ...draft, appearance };
    setDraft(next);
    applyAppearance(appearance);
    try {
      const value = await api<Settings>("/settings", {
        method: "PUT",
        body: JSON.stringify(next),
      });
      setSettings(value);
    } catch (reason) {
      setDraft({ ...draft, appearance: previous });
      applyAppearance(previous);
      notice((reason as Error).message, true);
    }
  }

  function ask(request: ConfirmRequest, action: () => Promise<void>) {
    setConfirm(request);
    setPendingAction(() => action);
  }

  async function close(accepted: boolean) {
    setConfirm(null);
    if (!accepted || !pendingAction) return;
    try {
      await pendingAction();
      await refreshEnvironment();
    } catch (reason) {
      notice((reason as Error).message, true);
    } finally {
      setPendingAction(null);
    }
  }

  async function removeModel(model: Model) {
    try {
      await api(`/models/${encodeURIComponent(model.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
      await refreshEnvironment();
      notice({
        title: "Model removed",
        description: `${model.name} was deleted and its storage was reclaimed.`,
        kind: "info",
      });
    } catch (reason) {
      notice((reason as Error).message, true);
    }
  }

  async function connectDeepgram() {
    setConnectingDeepgram(true);
    try {
      await api("/providers/deepgram", {
        method: "POST",
        body: JSON.stringify({ api_key: deepgramKey }),
      });
      setDeepgramKey("");
      setDraft({ ...draft, transcription_provider: "deepgram" });
      await refreshEnvironment();
      notice({ title: "Deepgram connected" });
    } catch (reason) {
      notice((reason as Error).message, true);
    } finally {
      setConnectingDeepgram(false);
    }
  }

  async function disconnectDeepgram() {
    await api("/providers/deepgram", {
      method: "DELETE",
      body: JSON.stringify({ confirm: true }),
    });
    setDraft({ ...draft, transcription_provider: "local" });
    await refreshEnvironment();
    notice({ title: "Deepgram disconnected" });
  }

  const presets = Object.fromEntries(
    Object.entries(environment.presets).map(([name, preset]) => [
      preset.model,
      titleCase(name),
    ]),
  );
  const models = environment.models
    .filter((item) => isRecommendedModel(item.id) || item.installed)
    .filter((item) =>
      `${item.id} ${item.name}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => {
      const installed = Number(b.installed) - Number(a.installed);
      if (installed) return installed;
      return (
        RECOMMENDED_MODEL_IDS.indexOf(
          a.id as (typeof RECOMMENDED_MODEL_IDS)[number],
        ) -
        RECOMMENDED_MODEL_IDS.indexOf(
          b.id as (typeof RECOMMENDED_MODEL_IDS)[number],
        )
      );
    });

  return (
    <section>
      <PageHeader
        title="Settings"
        action={
          <Link to="/welcome" className="text-button">
            Run setup ↗
          </Link>
        }
      />
      <div className="settings-grid">
        <div>
          <section className="settings-section appearance-section">
            <h2>Appearance</h2>
            <RadioGroup
              className="appearance-options"
              aria-label="Appearance"
              value={draft.appearance}
              onValueChange={(value) =>
                void changeAppearance(value as Appearance)
              }
            >
              {(["light", "dark", "system"] as const).map((appearance) => (
                <label
                  key={appearance}
                  data-selected={draft.appearance === appearance}
                >
                  <RadioGroupItem value={appearance} />
                  {titleCase(appearance)}
                </label>
              ))}
            </RadioGroup>
          </section>
          <form className="settings-section" onSubmit={save}>
            <h2>Preferences</h2>
            <Field className="field">
              <FieldLabel htmlFor="default-language">
                Default language
              </FieldLabel>
              <LanguageCombobox
                id="default-language"
                value={draft.language}
                languages={environment.languages}
                onValueChange={(language) => setDraft({ ...draft, language })}
              />
            </Field>
            <Field className="field">
              <FieldLabel htmlFor="transcription-provider">
                Transcription
              </FieldLabel>
              <AppSelect
                id="transcription-provider"
                value={draft.transcription_provider}
                onValueChange={(transcription_provider) =>
                  setDraft({
                    ...draft,
                    transcription_provider:
                      transcription_provider as Settings["transcription_provider"],
                  })
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
            <Field className="field">
              <FieldLabel htmlFor="default-preset">Default quality</FieldLabel>
              <AppSelect
                id="default-preset"
                value={draft.preset}
                onValueChange={(preset) =>
                  setDraft({
                    ...draft,
                    preset: preset as Settings["preset"],
                  })
                }
                options={(["fast", "balanced", "accurate"] as const).map(
                  (value) => ({ value, label: presetLabel(value) }),
                )}
              />
            </Field>
            <Field className="field">
              <FieldLabel htmlFor="duration-limit">
                Maximum recording length (hours)
              </FieldLabel>
              <Input
                id="duration-limit"
                type="number"
                min="0.1"
                max="24"
                step="0.1"
                required
                value={draft.max_duration_hours}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    max_duration_hours: Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field className="field">
              <FieldLabel htmlFor="hardware">Hardware (next job)</FieldLabel>
              <AppSelect
                id="hardware"
                value={draft.hardware}
                onValueChange={(hardware) =>
                  setDraft({
                    ...draft,
                    hardware: hardware as Settings["hardware"],
                  })
                }
                options={[
                  { value: "auto", label: "Automatic (recommended)" },
                  { value: "apple", label: "Apple MLX" },
                ]}
              />
            </Field>
            <label className="toggle-row">
              <Checkbox
                checked={draft.retain_source}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, retain_source: checked === true })
                }
              />
              <span>Keep recordings after transcription</span>
            </label>
            <Button type="submit">Save preferences</Button>
          </form>
          <div className="settings-section deepgram-settings">
            <div className="model-heading">
              <h2>Deepgram</h2>
              <Badge variant="outline">
                {environment.deepgram.configured
                  ? "Connected"
                  : "Not connected"}
              </Badge>
            </div>
            {environment.deepgram.configured ? (
              <Button variant="outline" onClick={disconnectDeepgram}>
                Disconnect
              </Button>
            ) : (
              <>
                <Field className="field">
                  <FieldLabel htmlFor="deepgram-key">API key</FieldLabel>
                  <Input
                    id="deepgram-key"
                    type="password"
                    autoComplete="off"
                    value={deepgramKey}
                    onChange={(event) => setDeepgramKey(event.target.value)}
                  />
                </Field>
                <Button
                  disabled={connectingDeepgram || deepgramKey.length < 20}
                  onClick={connectDeepgram}
                >
                  {connectingDeepgram ? "Connecting…" : "Connect"}
                </Button>
              </>
            )}
          </div>
        </div>
        <div>
          <div className="settings-section">
            <div className="model-heading">
              <h2>Models</h2>
              <span className="count">
                <AnimatedCounter
                  value={
                    environment.models.filter((item) => item.installed).length
                  }
                  duration={0.35}
                  suffix={<>&nbsp;installed</>}
                />
              </span>
            </div>
            <label className="visually-hidden" htmlFor="model-search">
              Search models
            </label>
            <Input
              id="model-search"
              type="search"
              placeholder="Search models"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div id="models-list">
              {models.length ? (
                models.map((model) => (
                  <ModelRow
                    key={model.id}
                    model={model}
                    preset={presets[model.id]}
                    install={() => {
                      void prepareSystemNotifications();
                      ask(
                        {
                          title: `Download ${model.name}?`,
                          description: `${model.estimate} from Hugging Face.`,
                          label: "Download model",
                        },
                        async () => {
                          await api(`/models/${encodeURIComponent(model.id)}`, {
                            method: "POST",
                            body: JSON.stringify({ confirm: true }),
                          });
                          trackModelDownload(model);
                          notice({
                            title: "Model download started",
                            description: `${model.name} will be verified before it becomes available. You can keep using the app.`,
                            kind: "info",
                          });
                        },
                      );
                    }}
                    remove={() => void removeModel(model)}
                  />
                ))
              ) : (
                <p className="empty-inline">No matching models.</p>
              )}
            </div>
          </div>
          <details className="settings-section">
            <summary>Diagnostics</summary>
            <dl>
              <dt>Studio version</dt>
              <dd>{environment.version}</dd>
              <dt>FFmpeg</dt>
              <dd>{environment.ffmpeg ? "Installed" : "Missing"}</dd>
              <dt>Whisper runtime</dt>
              <dd>MLX Whisper {environment.runtime}</dd>
              <dt>Backend</dt>
              <dd>{environment.compute.toUpperCase()}</dd>
              <dt>Database</dt>
              <dd>{environment.database ? "Healthy" : "Needs attention"}</dd>
              <dt>Storage</dt>
              <dd>
                {bytes(environment.used_bytes)} ·{" "}
                {bytes(environment.free_bytes)} free
              </dd>
              <dt>Data location</dt>
              <dd>{environment.data_location}</dd>
            </dl>
            <a
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href="/api/diagnostics"
              download
            >
              Download diagnostics
            </a>
          </details>
        </div>
      </div>
      <ConfirmDialog
        request={confirm}
        onClose={(accepted) => void close(accepted)}
      />
    </section>
  );
}

function ModelRow({
  model,
  preset,
  install,
  remove,
}: {
  model: Model;
  preset?: string;
  install: () => void;
  remove: () => void;
}) {
  const label =
    model.phase === "verifying"
      ? "Verifying…"
      : model.progress === null
        ? "Connecting…"
        : `${Math.floor(model.progress)}% · ${bytes(model.downloaded_bytes)} / ${bytes(model.total_bytes || 0)}`;
  return (
    <div className="model-row" data-model={model.id}>
      <div>
        <strong>{model.name}</strong>
        <small>
          {model.id} ·{" "}
          {model.size_bytes ? bytes(model.size_bytes) : model.estimate}
        </small>
        {model.downloading && (
          <>
            <small role="status">{label}</small>
            <ProgressBar
              value={model.progress}
              label={`${model.name} model download`}
            />
          </>
        )}
        {model.error && <small className="danger-text">{model.error}</small>}
      </div>
      <div className="model-actions">
        {preset && <Badge variant="secondary">{preset}</Badge>}
        {model.installed ? (
          <>
            <Badge variant="outline">Installed</Badge>
            <DeleteButton className="model-delete" onConfirm={remove} />
          </>
        ) : !model.downloading ? (
          <Button variant="outline" size="sm" onClick={install}>
            {model.error ? "Retry" : "Install"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
