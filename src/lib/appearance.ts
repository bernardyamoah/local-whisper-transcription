import type { Settings } from "./types";

export type Appearance = Settings["appearance"];

export function applyAppearance(appearance: Appearance) {
  if (typeof window === "undefined") return;
  localStorage.setItem("whisper:appearance", appearance);
  const dark =
    appearance === "dark" ||
    (appearance === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.appearance = appearance;
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#1c1c1e" : "#f5f5f3");
}
