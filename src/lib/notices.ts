import { sileo, type SileoState } from "sileo";

export type Notice = {
  title: string;
  description?: string;
  kind?: Exclude<SileoState, "loading" | "action">;
  duration?: number | null;
  button?: { title: string; onClick: () => void };
};

export type NoticeInput = string | Notice;

const FLASH_NOTICE = "whisper-studio:flash-notice";

export function showNotice(input: NoticeInput, isError = false): void {
  if (!input) {
    sileo.clear();
    return;
  }
  const notice: Notice =
    typeof input === "string"
      ? isError
        ? { title: "Something went wrong", description: input, kind: "error" }
        : { title: input, kind: "success" }
      : input;
  const kind = notice.kind || (isError ? "error" : "success");
  sileo[kind]({
    title: notice.title,
    description: notice.description,
    duration: notice.duration ?? (notice.description ? 6000 : 4000),
    button: notice.button,
    roundness: 16,
    autopilot: { expand: 250, collapse: 4200 },
  });
}

export function queueNotice(notice: Omit<Notice, "button">) {
  sessionStorage.setItem(FLASH_NOTICE, JSON.stringify(notice));
}

export function takeQueuedNotice(): Notice | null {
  const value = sessionStorage.getItem(FLASH_NOTICE);
  if (!value) return null;
  sessionStorage.removeItem(FLASH_NOTICE);
  try {
    return JSON.parse(value) as Notice;
  } catch {
    return null;
  }
}
