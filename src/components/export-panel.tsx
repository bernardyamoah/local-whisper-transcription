import {
  Download02Icon,
  FileTextIcon,
  FileTypeIcon,
  FileSpreadsheetIcon,
  FileCodeIcon,
  FileVideoIcon,
  FileZipIcon,
  FileBookmarkIcon,
  Link01Icon,
  MultiplicationSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { downloadTranscript } from "@/lib/export";
import type { NoticeInput } from "@/lib/notices";
import type { ExportDestinations } from "@/lib/types";

const FORMATS = [
  "md",
  "pdf",
  "docx",
  "csv",
  "json",
  "txt",
  "srt",
  "vtt",
  "bundle",
] as const;
const VIEWS = [
  { value: "transcript", label: "Transcript" },
  { value: "minutes", label: "Meeting minutes" },
  { value: "actions", label: "Action items" },
] as const;

const FORMAT_ICONS = {
  md: FileCodeIcon,
  pdf: FileTypeIcon,
  docx: FileTextIcon,
  csv: FileSpreadsheetIcon,
  json: FileCodeIcon,
  txt: FileTextIcon,
  srt: FileVideoIcon,
  vtt: FileVideoIcon,
  bundle: FileZipIcon,
};

type ExportPanelProps = {
  jobId: string;
  title: string;
  onSave: () => Promise<void>;
  notice: (message: NoticeInput, error?: boolean) => void;
};

const EMPTY_DESTINATIONS: ExportDestinations = {
  obsidian_vault: "",
  obsidian_folder: "Whisper Studio",
  notion_parent_id: "",
  notion_connected: false,
  webhook_url: "",
  webhook_connected: false,
  webhook_secret_set: false,
};

export function ExportPanel({
  jobId,
  title,
  onSave,
  notice,
}: ExportPanelProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("transcript");
  const [format, setFormat] = useState("md");
  const [busy, setBusy] = useState("");
  const [configuring, setConfiguring] = useState(false);
  const [destinations, setDestinations] = useState(EMPTY_DESTINATIONS);
  const [notionToken, setNotionToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  useEffect(() => {
    if (!open) return;
    void api<ExportDestinations>("/export-destinations")
      .then(setDestinations)
      .catch((reason: Error) => notice(reason.message, true));
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [notice, open]);

  async function download() {
    setBusy("download");
    try {
      await onSave();
      const suffix = format === "bundle" ? "zip" : format;
      const detail =
        view === "minutes"
          ? " meeting-minutes"
          : view === "actions"
            ? " action-items"
            : "";
      await downloadTranscript(
        jobId,
        format,
        `${title}${detail}.${suffix}`,
        view,
      );
      notice({
        title: "Export saved",
        description: `${title}${detail}.${suffix}`,
      });
    } catch (reason) {
      notice((reason as Error).message, true);
    } finally {
      setBusy("");
    }
  }

  async function saveDestinations() {
    setBusy("settings");
    try {
      const payload: Record<string, string> = {
        obsidian_vault: destinations.obsidian_vault,
        obsidian_folder: destinations.obsidian_folder,
        notion_parent_id: destinations.notion_parent_id,
        webhook_url: destinations.webhook_url,
      };
      if (notionToken) payload.notion_token = notionToken;
      if (webhookSecret) payload.webhook_secret = webhookSecret;
      const value = await api<ExportDestinations>("/export-destinations", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setDestinations(value);
      setNotionToken("");
      setWebhookSecret("");
      setConfiguring(false);
      notice({ title: "Destinations saved" });
    } catch (reason) {
      notice((reason as Error).message, true);
    } finally {
      setBusy("");
    }
  }

  async function deliver(destination: "obsidian" | "notion" | "webhook") {
    setBusy(destination);
    try {
      await onSave();
      const result = await api<{ path?: string; url?: string }>(
        `/jobs/${jobId}/deliver/${destination}`,
        {
          method: "POST",
          body: JSON.stringify({ view }),
        },
      );
      notice({
        title: `Sent to ${destination === "notion" ? "Notion" : destination === "obsidian" ? "Obsidian" : "webhook"}`,
        description: result.path || result.url,
      });
    } catch (reason) {
      notice((reason as Error).message, true);
      setConfiguring(true);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Export
        <HugeiconsIcon icon={Download02Icon} size={15} strokeWidth={1.8} />
      </Button>
      {open &&
        createPortal(
          <div
            className="export-overlay"
            role="presentation"
            onMouseDown={() => setOpen(false)}
          >
            <section
              className="export-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="export-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <h2 id="export-title">Export</h2>
                  <p>{title}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close export"
                  onClick={() => setOpen(false)}
                >
                  <HugeiconsIcon
                    icon={MultiplicationSignIcon}
                    size={19}
                    strokeWidth={1.8}
                  />
                </Button>
              </header>

              <div
                className="export-view"
                role="radiogroup"
                aria-label="Export content"
              >
                {VIEWS.map((item) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={view === item.value}
                    data-selected={view === item.value}
                    key={item.value}
                    onClick={() => {
                      setView(item.value);
                      if (format === "srt" || format === "vtt") setFormat("md");
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div
                className="export-formats"
                role="radiogroup"
                aria-label="Export format"
              >
                {FORMATS.map((item) => {
                  const unavailable =
                    view !== "transcript" && (item === "srt" || item === "vtt");
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={format === item}
                      data-selected={format === item}
                      disabled={unavailable}
                      key={item}
                      onClick={() => setFormat(item)}
                    >
                      <HugeiconsIcon
                        icon={FORMAT_ICONS[item]}
                        size={22}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      {item === "bundle"
                        ? "Project bundle"
                        : item.toUpperCase()}
                    </button>
                  );
                })}
              </div>

              <Button
                className="export-download"
                disabled={!!busy}
                onClick={() => void download()}
              >
                <HugeiconsIcon
                  icon={Download02Icon}
                  size={16}
                  aria-hidden="true"
                />
                {busy === "download"
                  ? "Exporting…"
                  : format === "bundle"
                    ? "Download project"
                    : "Download"}
              </Button>

              <div className="export-destinations">
                <div className="export-section-title">
                  <span>Send to</span>
                  <button
                    type="button"
                    onClick={() => setConfiguring(!configuring)}
                  >
                    {configuring ? "Done" : "Configure"}
                  </button>
                </div>
                <div className="export-destination-actions">
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => void deliver("obsidian")}
                  >
                    <HugeiconsIcon
                      icon={FileBookmarkIcon}
                      size={17}
                      aria-hidden="true"
                    />
                    {busy === "obsidian" ? "Sending…" : "Obsidian"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => void deliver("notion")}
                  >
                    <HugeiconsIcon
                      icon={FileTextIcon}
                      size={17}
                      aria-hidden="true"
                    />
                    {busy === "notion" ? "Sending…" : "Notion"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => void deliver("webhook")}
                  >
                    <HugeiconsIcon
                      icon={Link01Icon}
                      size={17}
                      aria-hidden="true"
                    />
                    {busy === "webhook" ? "Sending…" : "Webhook"}
                  </Button>
                </div>
              </div>

              {configuring && (
                <div className="export-config">
                  <label>
                    <span>Obsidian vault</span>
                    <Input
                      value={destinations.obsidian_vault}
                      placeholder="/Users/you/Documents/Notes"
                      onChange={(event) =>
                        setDestinations({
                          ...destinations,
                          obsidian_vault: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Obsidian folder</span>
                    <Input
                      value={destinations.obsidian_folder}
                      onChange={(event) =>
                        setDestinations({
                          ...destinations,
                          obsidian_folder: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Notion token</span>
                    <Input
                      type="password"
                      value={notionToken}
                      placeholder={
                        destinations.notion_connected
                          ? "Connected"
                          : "Secret token"
                      }
                      onChange={(event) => setNotionToken(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Notion parent page</span>
                    <Input
                      value={destinations.notion_parent_id}
                      placeholder="Page ID"
                      onChange={(event) =>
                        setDestinations({
                          ...destinations,
                          notion_parent_id: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="export-wide-field">
                    <span>Webhook URL</span>
                    <Input
                      type="url"
                      value={destinations.webhook_url}
                      placeholder="https://example.com/hooks/transcript"
                      onChange={(event) =>
                        setDestinations({
                          ...destinations,
                          webhook_url: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="export-wide-field">
                    <span>Webhook secret</span>
                    <Input
                      type="password"
                      value={webhookSecret}
                      placeholder={
                        destinations.webhook_secret_set
                          ? "Saved"
                          : "Optional bearer token"
                      }
                      onChange={(event) => setWebhookSecret(event.target.value)}
                    />
                  </label>
                  <Button
                    className="export-wide-field"
                    disabled={!!busy}
                    onClick={() => void saveDestinations()}
                  >
                    {busy === "settings" ? "Saving…" : "Save destinations"}
                  </Button>
                </div>
              )}
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
