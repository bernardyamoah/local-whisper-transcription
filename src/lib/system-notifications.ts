import type { Job, Model } from "./types";
import type { Notice } from "./notices";

type NativeNotificationBridge = {
  notify: (title: string, body: string) => Promise<boolean>;
  request_permission: () => Promise<boolean>;
  save_export?: (name: string, content: string) => Promise<string>;
  save_export_base64?: (name: string, content: string) => Promise<string>;
  save_export_url?: (name: string, url: string) => Promise<string>;
};

declare global {
  interface Window {
    pywebview?: { api?: NativeNotificationBridge };
  }
}

const MODEL_DOWNLOADS = "whisper-studio:model-downloads";
const TRANSCRIPTIONS = "whisper-studio:transcriptions";

function readTracked(key: string): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "{}") as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

function writeTracked(key: string, values: Record<string, string>) {
  sessionStorage.setItem(key, JSON.stringify(values));
}

export async function prepareSystemNotifications() {
  const bridge = window.pywebview?.api;
  if (bridge) return bridge.request_permission().catch(() => false);
  if (!("Notification" in window)) return false;
  if (window.Notification.permission === "granted") return true;
  if (window.Notification.permission === "denied") return false;
  return (await window.Notification.requestPermission()) === "granted";
}

export async function sendSystemNotification(title: string, body: string) {
  const bridge = window.pywebview?.api;
  if (bridge) return bridge.notify(title, body).catch(() => false);
  if (
    !("Notification" in window) ||
    window.Notification.permission !== "granted"
  )
    return false;
  new window.Notification(title, { body });
  return true;
}

export function trackModelDownload(model: Pick<Model, "id" | "name">) {
  const tracked = readTracked(MODEL_DOWNLOADS);
  tracked[model.id] = model.name;
  writeTracked(MODEL_DOWNLOADS, tracked);
}

export function checkModelDownloads(models: Model[]): Notice[] {
  const tracked = readTracked(MODEL_DOWNLOADS);
  const notices: Notice[] = [];
  let changed = false;
  for (const model of models) {
    if (!(model.id in tracked)) continue;
    if (model.installed) {
      void sendSystemNotification(
        "Model download completed",
        `${tracked[model.id]} is ready to use.`,
      );
      notices.push({
        title: "Model ready",
        description: `${tracked[model.id]} finished downloading and can now be selected for transcription.`,
        kind: "success",
        button: {
          title: "Open settings",
          onClick: () => window.location.assign("/settings"),
        },
      });
    } else if (model.phase === "failed" || model.error) {
      void sendSystemNotification(
        "Model download failed",
        model.error || `${tracked[model.id]} could not be downloaded.`,
      );
      notices.push({
        title: "Download failed",
        description:
          model.error || `${tracked[model.id]} could not be downloaded.`,
        kind: "error",
        duration: null,
        button: {
          title: "Retry",
          onClick: () => window.location.assign("/settings"),
        },
      });
    } else {
      continue;
    }
    delete tracked[model.id];
    changed = true;
  }
  if (changed) writeTracked(MODEL_DOWNLOADS, tracked);
  return notices;
}

export function trackTranscription(job: Pick<Job, "id" | "title">) {
  const tracked = readTracked(TRANSCRIPTIONS);
  tracked[job.id] = job.title;
  writeTracked(TRANSCRIPTIONS, tracked);
}

export function checkTranscription(job: Job): Notice | undefined {
  if (job.state !== "completed") return;
  const tracked = readTracked(TRANSCRIPTIONS);
  if (!(job.id in tracked)) return;
  void sendSystemNotification(
    "Transcription completed",
    `${tracked[job.id]} is ready.`,
  );
  delete tracked[job.id];
  writeTracked(TRANSCRIPTIONS, tracked);
  return {
    title: "Transcript ready",
    description: `${job.title} finished locally and is ready to review.`,
    kind: "success",
  };
}
