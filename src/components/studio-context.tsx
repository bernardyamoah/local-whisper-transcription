import { useNavigate } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../lib/api";
import { applyAppearance } from "../lib/appearance";
import { showNotice, takeQueuedNotice, type NoticeInput } from "../lib/notices";
import { checkModelDownloads } from "../lib/system-notifications";
import type { Environment, Settings } from "../lib/types";

type StudioState = {
  environment: Environment;
  settings: Settings;
  setSettings: (settings: Settings) => void;
  refreshEnvironment: () => Promise<Environment>;
  notice: (message: NoticeInput, error?: boolean) => void;
};

const StudioContext = createContext<StudioState | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironment] = useState<Environment>();
  const [settings, setSettings] = useState<Settings>();
  const refreshEnvironment = useCallback(async () => {
    const value = await api<Environment>("/environment");
    checkModelDownloads(value.models).forEach((completed) =>
      showNotice(completed),
    );
    setEnvironment(value);
    return value;
  }, []);
  const notice = useCallback(showNotice, []);
  useEffect(() => {
    const queued = takeQueuedNotice();
    if (queued) notice(queued);
    Promise.all([refreshEnvironment(), api<Settings>("/settings")])
      .then(([, value]) => setSettings(value))
      .catch((reason: Error) => notice(reason.message, true));
  }, [notice, refreshEnvironment]);
  useEffect(() => {
    if (!settings) return;
    applyAppearance(settings.appearance);
    if (settings.appearance !== "system") return;
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyAppearance("system");
    scheme.addEventListener("change", update);
    return () => scheme.removeEventListener("change", update);
  }, [settings]);
  useEffect(() => {
    const timer = window.setInterval(
      () => void refreshEnvironment().catch(() => undefined),
      3000,
    );
    return () => window.clearInterval(timer);
  }, [refreshEnvironment]);
  const value = useMemo(
    () =>
      environment && settings
        ? { environment, settings, setSettings, refreshEnvironment, notice }
        : null,
    [environment, notice, refreshEnvironment, settings],
  );
  return (
    <StudioContext.Provider value={value}>
      {value ? children : <p className="loading">Loading…</p>}
    </StudioContext.Provider>
  );
}

export function useStudio() {
  const value = useContext(StudioContext);
  if (!value) throw new Error("Studio is not ready");
  return value;
}

export function LegacyHashRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === "settings" || hash === "library") {
      void navigate({ to: `/${hash}` });
      history.replaceState(null, "", `/${hash}`);
    } else if (hash.startsWith("job/")) {
      const jobId = hash.slice(4);
      void navigate({ to: "/jobs/$jobId", params: { jobId } });
      history.replaceState(null, "", `/jobs/${jobId}`);
    }
  }, [navigate]);
  return null;
}
