const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
if ("IntersectionObserver" in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.08 },
  );
  document.querySelectorAll(".reveal").forEach((element) => {
    element.classList.add("js-reveal");
    observer.observe(element);
  });
}

const preview = document.querySelector(".reading-sheet");
const previewRows = [...document.querySelectorAll("[data-reading-row]")];
let previewTimer;
let previewStep = 0;
let previewInView = false;

function renderPreview() {
  previewRows.forEach((row, index) =>
    row.classList.toggle("is-current", index === previewStep),
  );
}

function stopPreview() {
  clearInterval(previewTimer);
  previewTimer = undefined;
  preview.classList.remove("is-animated");
}

function startPreview() {
  stopPreview();
  previewStep = 0;
  renderPreview();
  if (reducedMotion.matches || document.hidden || !previewInView) return;
  preview.classList.add("is-animated");
  previewTimer = setInterval(() => {
    previewStep = (previewStep + 1) % previewRows.length;
    renderPreview();
  }, 3000);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPreview();
  else startPreview();
});
reducedMotion.addEventListener("change", startPreview);
new IntersectionObserver(
  ([entry]) => {
    previewInView = entry.isIntersecting;
    if (previewInView) startPreview();
    else stopPreview();
  },
  { threshold: 0.35 },
).observe(preview);
