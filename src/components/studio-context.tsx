import { useNavigate } from "@tanstack/react-router";
import { sileo } from "sileo";
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
import type { Environment, Settings } from "../lib/types";

type StudioState = {
  environment: Environment;
  settings: Settings;
  setSettings: (settings: Settings) => void;
  refreshEnvironment: () => Promise<Environment>;
  notice: (message: string, error?: boolean) => void;
};

const StudioContext = createContext<StudioState | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironment] = useState<Environment>();
  const [settings, setSettings] = useState<Settings>();
  const refreshEnvironment = useCallback(async () => {
    const value = await api<Environment>("/environment");
    setEnvironment(value);
    return value;
  }, []);
  const notice = useCallback((value: string, isError = false) => {
    if (!value) return sileo.clear();
    (isError ? sileo.error : sileo.success)({ title: value });
  }, []);
  useEffect(() => {
    Promise.all([refreshEnvironment(), api<Settings>("/settings")])
      .then(([, value]) => setSettings(value))
      .catch((reason: Error) => notice(reason.message, true));
  }, [notice, refreshEnvironment]);
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
