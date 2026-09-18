import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ reducedMotion: "reduce" });

test("website works without the studio API and offers the macOS installer", async ({
  page,
}) => {
  const apiCalls = [];
  await page.route("**/api/**", (route) => {
    apiCalls.push(route.request().url());
    return route.abort();
  });
  await page.goto("/website/");
  await expect(page).toHaveTitle(/Every word, worth keeping/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Worth keeping",
  );
  await expect(
    page.getByRole("button", { name: "Animate preview" }),
  ).toHaveCount(0);
  const downloads = page.getByRole("link", {
    name: /Download for Mac|Download installer/,
  });
  await expect(downloads.first()).toHaveAttribute(
    "href",
    "/download/Whisper-Studio.dmg",
  );
  await expect(downloads.first()).toHaveAttribute("download", "");
  await page.getByText("Does it work offline?", { exact: true }).click();
  await expect(
    page.getByText("Yes. Download a transcription model", { exact: false }),
  ).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  expect(apiCalls).toEqual([]);
});

test("transcript preview plays automatically while visible", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/website/");
  const preview = page.locator(".reading-sheet");
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveClass(/is-animated/);
  await expect(preview.locator(".reading-row").first()).toHaveClass(
    /is-current/,
  );
  await expect(
    page.getByRole("button", { name: "Animate preview" }),
  ).toHaveCount(0);
});

test("first-run setup requires a download action, recovers from failure, resumes and saves preferences", async ({
  page,
}) => {
  let phase = "missing";
  let requests = 0;
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), onboarding_completed: false },
    });
  });
  await page.route("**/api/environment", async (route) => {
    const response = await route.fetch();
    const environment = await response.json();
    environment.models = environment.models.map((model) => ({
      ...model,
      installed: phase === "ready" && model.id === "turbo",
      downloading: phase === "downloading" && model.id === "turbo",
      progress: 25,
      downloaded_bytes: 250000,
      total_bytes: 1000000,
      error: null,
    }));
    await route.fulfill({ json: environment });
  });
  await page.route("**/api/models/turbo", async (route) => {
    requests++;
    if (requests === 1)
      return route.fulfill({
        status: 503,
        json: { detail: "Download unavailable. Try again." },
      });
    phase = "downloading";
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A little room for your words.",
  );
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Set up my studio" }).click();
  await expect(page.getByRole("radio", { name: /Balanced/ })).toBeChecked();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Download model" }).click();
  await expect(page.getByRole("alert")).toContainText("Download unavailable");
  await page.getByRole("button", { name: "Download model" }).click();
  await expect(
    page.getByRole("progressbar", { name: "Model download progress" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Find your balance.",
  );
  expect(requests).toBe(2);
  phase = "ready";
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Continue" }).click();
  const language = page.getByRole("combobox", { name: "Recording language" });
  await language.fill("French");
  await page.getByRole("option", { name: "French", exact: true }).click();
  await page
    .getByRole("checkbox", { name: /Keep original recordings/ })
    .uncheck();
  await page.getByRole("button", { name: "Add my first recording" }).click();
  await expect(
    page.getByRole("heading", { name: "New transcription" }),
  ).toBeVisible();
  const saved = await page.request.get("/api/settings");
  expect(await saved.json()).toMatchObject({
    onboarding_completed: true,
    language: "fr",
    preset: "balanced",
    retain_source: false,
  });
  await page.unroute("**/api/settings");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "New transcription" }),
  ).toBeVisible();
  await page.request.put("/api/settings", {
    headers: { "X-Studio-Request": "1" },
    data: {
      language: "auto",
      preset: "balanced",
      retain_source: true,
      hardware: "auto",
      max_duration_hours: 4,
      onboarding_completed: false,
    },
  });
});

test("setup can be skipped and exposes missing dependencies on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/environment", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...(await response.json()), ffmpeg: null } });
  });
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Set up my studio" }).click();
  await expect(page.getByRole("alert")).toContainText("FFmpeg is missing");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Set up later" }).click();
  await expect(
    page.getByRole("heading", { name: "New transcription" }),
  ).toBeVisible();
});
