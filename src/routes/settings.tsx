import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AppSelect } from "@/components/app-select";
import { Badge } from "@/components/ui/badge";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteButton } from "@/components/ui/delete-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useStudio } from "../components/studio-context";
import {
  Button,
  ConfirmDialog,
  PageHeader,
  ProgressBar,
  type ConfirmRequest,
} from "../components/ui";
import { api, bytes, titleCase } from "../lib/api";
import { isRecommendedModel, RECOMMENDED_MODEL_IDS } from "../lib/models";
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
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [pendingAction, setPendingAction] = useState<
    null | (() => Promise<void>)
  >(null);
  const names = useMemo(
    () => new Intl.DisplayNames(["en"], { type: "language" }),
    [],
  );

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const value = await api<Settings>("/settings", {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      setSettings(value);
      notice("Preferences saved");
    } catch (reason) {
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
    } catch (reason) {
      notice((reason as Error).message, true);
    }
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
      <PageHeader title="Settings" />
      <div className="settings-grid">
        <div>
          <form className="settings-section" onSubmit={save}>
            <h2>Preferences</h2>
            <Field className="field">
              <FieldLabel htmlFor="default-language">
                Default language
              </FieldLabel>
              <AppSelect
                id="default-language"
                value={draft.language}
                onValueChange={(language) => setDraft({ ...draft, language })}
                options={[
                  { value: "auto", label: "Detect automatically" },
                  ...[...environment.languages]
                    .sort((a, b) =>
                      (names.of(a) || a).localeCompare(names.of(b) || b),
                    )
                    .map((code) => ({
                      value: code,
                      label: names.of(code) || code,
                    })),
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
                  (value) => ({ value, label: titleCase(value) }),
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
                  { value: "auto", label: "Automatic" },
                  { value: "cpu", label: "CPU" },
                  { value: "cuda", label: "CUDA" },
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
              <dd>faster-whisper {environment.runtime}</dd>
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
