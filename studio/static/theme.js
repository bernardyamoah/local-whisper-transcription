(() => {
  const appearance = localStorage.getItem("whisper:appearance") || "system";
  const dark =
    appearance === "dark" ||
    (appearance === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.appearance = appearance;
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();
