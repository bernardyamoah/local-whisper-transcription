import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
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

const sections = [
  "appearance",
  "preferences",
  "connections",
  "models",
  "diagnostics",
] as const;
type SettingsSection = (typeof sections)[number];

export const Route = createFileRoute("/settings")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: SettingsSection } => ({
    section: sections.includes(search.section as SettingsSection)
      ? (search.section as SettingsSection)
      : undefined,
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { environment, settings, setSettings, refreshEnvironment, notice } =
    useStudio();
  const [draft, setDraft] = useState(settings);
  const [query, setQuery] = useState("");
  const activeSection = Route.useSearch().section ?? "appearance";
  const [deepgramKey, setDeepgramKey] = useState("");
  const [connectingDeepgram, setConnectingDeepgram] = useState(false);
  const [jevKey, setJevKey] = useState("");
  const [connectingJev, setConnectingJev] = useState(false);
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

  async function connectJev() {
    setConnectingJev(true);
    try {
      await api("/providers/jev", {
        method: "POST",
        body: JSON.stringify({ api_key: jevKey }),
      });
      const value = await api<Settings>("/settings");
      setJevKey("");
      setDraft(value);
      setSettings(value);
      await refreshEnvironment();
      notice({ title: "Smart Moments connected" });
    } catch (reason) {
      notice((reason as Error).message, true);
    } finally {
      setConnectingJev(false);
    }
  }

  async function disconnectJev() {
    await api("/providers/jev", {
      method: "DELETE",
      body: JSON.stringify({ confirm: true }),
    });
    const value = await api<Settings>("/settings");
    setDraft(value);
    setSettings(value);
    await refreshEnvironment();
    notice({ title: "Smart Moments disconnected" });
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
    <section className="settings-page">
      <PageHeader
        title="Settings"
        action={
          <Link to="/welcome" className="text-button">
            Run setup ↗
          </Link>
        }
      />
      <nav className="settings-navigation" aria-label="Settings sections">
        {sections.map((id) => (
          <Link
            key={id}
            to="/settings"
            search={{ section: id }}
            aria-current={activeSection === id ? "page" : undefined}
          >
            {titleCase(id)}
          </Link>
        ))}
        <small className="settings-version">
          Whisper Studio
          <br />
          Version {environment.version}
        </small>
      </nav>
      <div className="settings-grid">
        <div>
          <section
            id="settings-appearance"
            hidden={activeSection !== "appearance"}
            className="settings-section appearance-section"
          >
            <h2>Appearance</h2>
            <RadioGroup
              className="appearance-options appearance-gallery"
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
                  <span
                    className="appearance-illustration"
                    data-theme={appearance}
                    aria-hidden="true"
                  >
                    <span className="appearance-landscape" />
                    <span className="appearance-mini-window">
                      <span className="appearance-mini-title">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="appearance-mini-sidebar">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="appearance-mini-content">
                        <span className="appearance-mini-wave">
                          {[8, 16, 11, 24, 18, 30, 14, 22, 10, 17, 8].map(
                            (height, index) => (
                              <i key={index} style={{ height }} />
                            ),
                          )}
                        </span>
                        <span className="appearance-mini-line" />
                        <span className="appearance-mini-line" />
                        <span className="appearance-mini-line" />
                      </span>
                    </span>
                  </span>
                  <span className="appearance-choice-label">
                    <span>{titleCase(appearance)}</span>
                    <span
                      className="appearance-choice-dot"
                      aria-hidden="true"
                    />
                  </span>
                </label>
              ))}
            </RadioGroup>
          </section>
          <form
            id="settings-preferences"
            hidden={activeSection !== "preferences"}
            className="settings-section"
            onSubmit={save}
          >
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
            <label className="toggle-row">
              <Checkbox
                disabled={!environment.jev.configured}
                checked={draft.smart_moments}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, smart_moments: checked === true })
                }
              />
              <span>Automatic Smart Moments</span>
            </label>
            <Button type="submit">Save preferences</Button>
          </form>
          <div
            id="settings-connections"
            hidden={activeSection !== "connections"}
            className="settings-section deepgram-settings"
          >
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
          <div
            className="settings-section jev-settings"
            hidden={activeSection !== "connections"}
          >
            <div className="model-heading">
              <h2>Smart Moments</h2>
              <Badge variant="outline">
                {environment.jev.configured ? "Connected" : "Not connected"}
              </Badge>
            </div>
            {environment.jev.error && (
              <p role="alert" className="text-destructive">
                {environment.jev.error}
              </p>
            )}
            {environment.jev.configured ? (
              <Button variant="outline" onClick={disconnectJev}>
                Disconnect
              </Button>
            ) : (
              <>
                <Field className="field">
                  <FieldLabel htmlFor="jev-key">TypeSafe API key</FieldLabel>
                  <Input
                    id="jev-key"
                    type="password"
                    autoComplete="off"
                    value={jevKey}
                    onChange={(event) => setJevKey(event.target.value)}
                  />
                </Field>
                <Button
                  disabled={connectingJev || jevKey.length < 20}
                  onClick={connectJev}
                >
                  {connectingJev ? "Connecting…" : "Connect"}
                </Button>
              </>
            )}
          </div>
        </div>
        <div>
          <div
            id="settings-models"
            className="settings-section"
            hidden={activeSection !== "models"}
          >
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
          <section
            id="settings-diagnostics"
            className="settings-section"
            hidden={activeSection !== "diagnostics"}
          >
            <h2>Diagnostics</h2>
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
          </section>
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
