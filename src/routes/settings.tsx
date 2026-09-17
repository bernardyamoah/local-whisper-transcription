import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useStudio } from "../components/studio-context";
import {
  Button,
  ConfirmDialog,
  PageHeader,
  ProgressBar,
  type ConfirmRequest,
} from "../components/ui";
import { api, bytes, titleCase } from "../lib/api";
import type { Model, Settings } from "../lib/types";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const { environment, settings, setSettings, refreshEnvironment, notice } =
    useStudio();
  const [draft, setDraft] = useState(settings);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState("");
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [pendingAction, setPendingAction] = useState<
    null | (() => Promise<void>)
  >(null);
  const names = useMemo(
    () => new Intl.DisplayNames(["en"], { type: "language" }),
    [],
  );

  useEffect(() => {
    const timer = window.setInterval(() => void refreshEnvironment(), 3000);
    return () => window.clearInterval(timer);
  }, [refreshEnvironment]);

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const value = await api<Settings>("/settings", {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      setSettings(value);
      setSaved("Preferences saved");
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

  const presets = Object.fromEntries(
    Object.entries(environment.presets).map(([name, preset]) => [
      preset.model,
      titleCase(name),
    ]),
  );
  const models = environment.models
    .filter((item) =>
      `${item.id} ${item.name}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => Number(b.installed) - Number(a.installed));

  return (
    <section>
      <PageHeader title="Settings" />
      <div className="settings-grid">
        <div>
          <form className="settings-section" onSubmit={save}>
            <h2>Preferences</h2>
            <div className="field">
              <label htmlFor="default-language">Default language</label>
              <select
                id="default-language"
                value={draft.language}
                onChange={(event) =>
                  setDraft({ ...draft, language: event.target.value })
                }
              >
                <option value="auto">Detect automatically</option>
                {[...environment.languages]
                  .sort((a, b) =>
                    (names.of(a) || a).localeCompare(names.of(b) || b),
                  )
                  .map((code) => (
                    <option key={code} value={code}>
                      {names.of(code)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="default-preset">Default quality</label>
              <select
                id="default-preset"
                value={draft.preset}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    preset: event.target.value as Settings["preset"],
                  })
                }
              >
                {(["fast", "balanced", "accurate"] as const).map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="duration-limit">
                Maximum recording length (hours)
              </label>
              <input
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
            </div>
            <div className="field">
              <label htmlFor="hardware">Hardware (next job)</label>
              <select
                id="hardware"
                value={draft.hardware}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    hardware: event.target.value as Settings["hardware"],
                  })
                }
              >
                <option value="auto">Automatic</option>
                <option value="cpu">CPU</option>
                <option value="cuda">CUDA</option>
              </select>
            </div>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={draft.retain_source}
                onChange={(event) =>
                  setDraft({ ...draft, retain_source: event.target.checked })
                }
              />
              <span>Keep recordings after transcription</span>
            </label>
            <Button type="submit">Save preferences</Button>
            <span id="settings-saved" className="save-status" role="status">
              {saved}
            </span>
          </form>
        </div>
        <div>
          <div className="settings-section">
            <div className="model-heading">
              <h2>Models</h2>
              <span className="count">
                {environment.models.filter((item) => item.installed).length}{" "}
                installed
              </span>
            </div>
            <label className="visually-hidden" htmlFor="model-search">
              Search models
            </label>
            <input
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
                    install={() =>
                      ask(
                        {
                          title: `Download ${model.name}?`,
                          description: `${model.estimate} from Hugging Face.`,
                          label: "Download model",
                        },
                        () =>
                          api(`/models/${encodeURIComponent(model.id)}`, {
                            method: "POST",
                            body: JSON.stringify({ confirm: true }),
                          }),
                      )
                    }
                    remove={() =>
                      ask(
                        {
                          title: `Delete ${model.name}?`,
                          description: `Removes ${bytes(model.size_bytes)} from this computer.`,
                          label: "Delete model",
                          danger: true,
                        },
                        () =>
                          api(`/models/${encodeURIComponent(model.id)}`, {
                            method: "DELETE",
                            body: JSON.stringify({ confirm: true }),
                          }),
                      )
                    }
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
              className="button secondary small"
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
        {preset && <span className="model-preset">{preset}</span>}
        {model.installed ? (
          <>
            <span className="status">Installed</span>
            <Button className="secondary small danger-text" onClick={remove}>
              Delete
            </Button>
          </>
        ) : !model.downloading ? (
          <Button className="secondary small" onClick={install}>
            {model.error ? "Retry" : "Install"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
