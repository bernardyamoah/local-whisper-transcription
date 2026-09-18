import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function wav() {
  const b = Buffer.alloc(44 + 64000);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(64000, 40);
  return b;
}

async function choose(page, selector, label) {
  await page.locator(selector).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function expectDarkControl(locator) {
  const colors = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const channels = (value) =>
      (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    return {
      background: channels(style.backgroundColor),
      foreground: channels(style.color),
    };
  });
  expect(Math.max(...colors.background)).toBeLessThan(100);
  expect(Math.min(...colors.foreground)).toBeGreaterThan(180);
}

async function mockSystemNotifications(page) {
  await page.addInitScript(() => {
    window.systemNotifications = JSON.parse(
      sessionStorage.getItem("test:system-notifications") || "[]",
    );
    class TestNotification {
      static permission = "granted";
      static requestPermission = async () => "granted";

      constructor(title, options) {
        window.systemNotifications.push({ title, body: options?.body || "" });
        sessionStorage.setItem(
          "test:system-notifications",
          JSON.stringify(window.systemNotifications),
        );
      }
    }
    Object.defineProperty(window, "Notification", { value: TestNotification });
  });
}

test("record a meeting and keep its live transcript", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "New transcription" }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Record meeting" }).click();
  await expect(page.getByText("Recording", { exact: true })).toBeVisible();
  await expect(page.getByText("00:00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Options/ })).toBeHidden();
  const recordingStage = page.locator('.capture-stage[data-recording="true"]');
  await expect
    .poll(async () => (await recordingStage.boundingBox())?.height)
    .toBeLessThan(700);
  await expect(
    page.getByText("We should ship the live meeting view."),
  ).toBeVisible();
  await expect(page.locator(".capture-orb")).toBeVisible();
  await expect.poll(async () => {
    const orb = await page.locator(".capture-orb").boundingBox();
    const timer = await page.locator(".session-timer").boundingBox();
    return Math.abs(orb.x + orb.width / 2 - timer.x - timer.width / 2);
  }).toBeLessThan(2);
  await page.screenshot({path: "test-results/recording-compact.png"});
  await page.getByRole("button", {name: "Expand transcript"}).click();
  await expect(page.locator(".capture-orb")).toHaveCount(0);
  await expect(page.getByText("We should ship the live meeting view.")).toBeVisible();
  await expect.poll(async () => {
    const toolbar = await page.locator(".session-toolbar").boundingBox();
    const timer = await page.locator(".session-timer").boundingBox();
    return Math.abs(toolbar.x + toolbar.width / 2 - timer.x - timer.width / 2);
  }).toBeLessThan(2);
  await page.waitForTimeout(350);
  await page.screenshot({path: "test-results/recording-expanded.png"});
  await page.getByRole("button", {name: "Compact view"}).click();
  await page.getByRole("button", { name: "Decision", exact: true }).click();
  await expect(page.getByText("1 bookmark", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.locator("#transcript-title")).toHaveValue(
    "Meeting recording",
  );
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.locator("audio")).toHaveCount(1);
  await expect(
    page.getByText("We should ship the live meeting view."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start transcription" }),
  ).toHaveCount(0);
});

test("live transcript preserves scroll position and earlier lines", async ({ page }) => {
  let lines = Array.from({ length: 30 }, (_, index) => ({
    source: "Meeting", start: index, text: `Meeting line ${index + 1}`, final: true,
  }));
  await page.route("**/api/recordings", async (route) => {
    await route.fulfill({ json: { state: "recording", elapsed: 90, live_transcript: lines } });
  });
  await page.goto("/");
  const feed = page.getByRole("region", { name: "Live transcript", exact: true });
  await expect(feed.locator("p")).toHaveCount(30);
  await expect(page.locator(".capture-orb")).toHaveCSS("width", "220px");
  await expect.poll(() => feed.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await feed.evaluate((element) => { element.scrollTop = 0; });
  await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
  lines = [...lines, { source: "Meeting", start: 31, text: "Latest meeting line", final: true }];
  await expect(feed.locator("p")).toHaveCount(31);
  expect(await feed.evaluate((element) => element.scrollTop)).toBeLessThan(2);
  await page.getByRole("button", { name: "Jump to latest" }).click();
  await expect.poll(() => feed.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(2);
  await page.getByRole("button", { name: "Expand transcript" }).click();
  await page.waitForTimeout(350);
  await feed.evaluate((element) => { element.scrollTop = 0; });
  await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
  lines = [...lines, { source: "Meeting", start: 32, text: "Another meeting line", final: true }];
  await expect(feed.locator("p")).toHaveCount(32);
  expect(await feed.evaluate((element) => element.scrollTop)).toBeLessThan(2);
});

test("settings sections are separate navigable pages with a version", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.locator(".settings-version")).toContainText(/Version \d+\.\d+\.\d+/);
  await expect(page.locator(".settings-section:visible")).toHaveCount(1);
  await page.getByRole("link", { name: "Preferences", exact: true }).click();
  await expect(page).toHaveURL(/section=preferences/);
  await expect(page.locator("#settings-appearance")).toBeHidden();
  await expect(page.locator("#settings-preferences")).toBeVisible();
  await expect(page.getByRole("link", { name: "Preferences", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Connections", exact: true }).click();
  await expect(page.locator(".settings-section:visible")).toHaveCount(2);
  await page.goBack();
  await expect(page.locator("#settings-preferences")).toBeVisible();
  await page.reload();
  await expect(page.locator("#settings-preferences")).toBeVisible();
  await page.getByRole("link", { name: "Diagnostics", exact: true }).click();
  await expect(page.getByText("Studio version", { exact: true })).toBeVisible();
});

test("import, process, edit, reload, search, copy, export and delete", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockSystemNotifications(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "New transcription" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute(
    "href",
    /\/assets\/.*\.css$/,
  );
  expect(
    await page
      .getByRole("heading", { name: "New transcription" })
      .evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain("SF Pro Text");
  await page.getByRole("button", { name: /^Options/ }).click();
  const language = page.getByRole("combobox", {
    name: "Recording language",
  });
  await language.fill("French");
  await page.getByRole("option", { name: "French", exact: true }).click();
  await expect(language).toHaveValue("French");
  await page.locator("#file-input").setInputFiles({
    name: "A conversation.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  await expect(page.locator("#recording-title")).toHaveValue("A conversation");
  await expect(
    page.getByText("Recording ready", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Start transcription" }).click();
  await expect(page.locator("#transcript-title")).toBeVisible({
    timeout: 15000,
  });
  await expect
    .poll(() => page.evaluate(() => window.systemNotifications))
    .toContainEqual({
      title: "Transcription completed",
      body: "A conversation is ready.",
    });
  await expect(
    page.getByText("Transcript ready", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(page.getByText("The story behind a voice")).toBeVisible();
  await expect(page.getByLabel("Name for speaker 1")).toHaveValue("Speaker 1");
  const audio = page.locator("audio");
  const transport = page.locator('[data-slot="step-player-control"]');
  await expect(page.locator('[data-slot="slider"]')).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: "Back to library" }),
  ).toHaveAttribute("href", "/library");
  await expect(audio).not.toHaveAttribute("controls");
  await page.getByRole("slider", { name: "Seek recording" }).fill("0.5");
  await page.getByRole("button", { name: /^Bookmark 00:/ }).click();
  await expect(
    page.locator(".bookmark-list").getByText("Key point", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => audio.evaluate((element) => element.currentTime))
    .toBeCloseTo(0.5, 1);
  await expect(
    page.locator('[data-segment][data-playback="current"]'),
  ).toContainText("Every voice has a story.");
  await page.getByRole("slider", { name: "Volume" }).fill("0.5");
  await expect
    .poll(() => audio.evaluate((element) => element.volume))
    .toBe(0.5);
  await page.getByRole("slider", { name: "Seek recording" }).fill("0");
  await transport.click();
  await expect
    .poll(() => audio.evaluate((element) => !element.paused))
    .toBe(true);
  await transport.click();
  await expect
    .poll(() => audio.evaluate((element) => element.paused))
    .toBe(true);
  await page
    .locator('.transcript')
    .getByRole("button", { name: "Play from 00:01" })
    .click();
  await expect
    .poll(() => audio.evaluate((element) => element.currentTime))
    .toBeGreaterThanOrEqual(1);
  await expect(
    page.locator('[data-segment][data-playback="past"]'),
  ).toContainText("Every voice has a story.");
  await expect(
    page.locator('[data-segment][data-playback="current"]'),
  ).toContainText("Give yours a little space.");
  await page
    .locator("[data-segment]")
    .first()
    .getByRole("button", { name: "Play from 00:00" })
    .click();
  await expect
    .poll(() => audio.evaluate((element) => element.currentTime))
    .toBeLessThan(0.9);
  await transport.click();
  const text = page.getByRole("textbox", { name: "Segment at 00:00" });
  await text.fill("A corrected thought, saved for later.");
  await expect(page.locator("#save-status")).toHaveText("All changes saved");
  await page.reload();
  await expect(text).toHaveValue("A corrected thought, saved for later.");
  await page.evaluate(() => {
    window.searchScrolls = [];
    const scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...args) {
      if (this instanceof HTMLElement && this.dataset.segment) {
        window.searchScrolls.push(this.dataset.segment);
      }
      return scrollIntoView.apply(this, args);
    };
  });
  await page.locator("#transcript-search").fill("a");
  await expect(page.locator("#match-count")).toHaveText("1 of 2");
  await expect
    .poll(() => page.evaluate(() => window.searchScrolls.length))
    .toBe(1);
  await page.getByRole("button", { name: "Next search match" }).click();
  await expect(page.locator("#match-count")).toHaveText("2 of 2");
  await expect
    .poll(() => page.evaluate(() => window.searchScrolls.length))
    .toBe(2);
  await page.locator("#transcript-search").fill("corrected");
  await expect(page.locator("#match-count")).toHaveText("1 of 1");
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "A corrected thought",
  );
  await expect(
    page.getByText("Transcript copied", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("2 segments copied to the clipboard.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  for (const format of ["txt", "srt", "vtt"]) {
    await page
      .getByRole("radio", { name: format.toUpperCase(), exact: true })
      .click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`A conversation.${format}`);
    const stream = await file.createReadStream();
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    expect(Buffer.concat(chunks).toString()).toContain("A corrected thought");
  }
  await page.evaluate(() => {
    window.nativeExports = [];
    window.pywebview = {
      api: {
        save_export: async (name, content) => {
          window.nativeExports.push({ name, content });
          return `/Users/test/Downloads/${name}`;
        },
      },
    };
  });
  await page.getByRole("radio", { name: "TXT", exact: true }).click();
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.nativeExports))
    .toContainEqual({
      name: "A conversation.txt",
      content: expect.stringContaining("A corrected thought"),
    });
  await expect(page.getByText("Export saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close export" }).click();
  await page.screenshot({
    path: "test-results/editor-desktop.png",
    fullPage: true,
  });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "test-results/editor-desktop-dark.png",
    fullPage: true,
  });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.waitForTimeout(300);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await choose(page, "#delete-scope", "Everything");
  const deleteControl = page.locator(
    ".editor-foot [data-slot='delete-button']",
  );
  await deleteControl
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await deleteControl.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(
    page.getByText("Transcript deleted", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [1440, 768, 390]) {
  test(`responsive upload, settings and keyboard at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "New transcription" }),
    ).toBeVisible();
    const sidebar = page.locator("#studio-sidebar");
    await expect(sidebar).toBeVisible();
    await page.getByRole("button", { name: "Hide sidebar" }).click();
    await expect
      .poll(() =>
        sidebar.evaluate((element) => element.getAnimations().length > 0),
      )
      .toBeTruthy();
    await expect(sidebar).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Show sidebar" }),
    ).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Show sidebar" }).click();
    await expect
      .poll(() =>
        sidebar.evaluate((element) => element.getAnimations().length > 0),
      )
      .toBeTruthy();
    await expect(sidebar).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/upload-${width}.png`,
      fullPage: true,
    });
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.getByRole("link", { name: "Preferences", exact: true }).click();
    await choose(page, "#default-preset", "Quick");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.locator("[data-sileo-title]")).toContainText(
      "Preferences saved",
    );
    await expect(
      page.getByText(
        "These defaults will be used for your next transcription.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator("[data-sileo-viewport]")
          .evaluate((element) => getComputedStyle(element).position),
      )
      .toBe("fixed");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/settings-${width}.png`,
      fullPage: true,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole("link", { name: "New transcription" }).click();
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => document.activeElement !== document.body),
    ).toBeTruthy();
  });
}

test("appearance follows light, dark, and system preferences", async ({
  page,
}) => {
  const selectAppearance = async (name) => {
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/settings") &&
          response.request().method() === "PUT" &&
          response.ok(),
      ),
      page.getByRole("radio", { name }).click(),
    ]);
  };

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await selectAppearance("Dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "dark");
  await page.screenshot({
    path: "test-results/settings-dark.png",
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Add recording" }),
  ).toBeVisible();
  await expect(page.locator(".upload-workspace")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator(".upload-workspace")).toHaveCSS(
    "box-shadow",
    "none",
  );
  await expectDarkControl(page.getByRole("button", { name: "Record meeting" }));
  await page.getByRole("button", { name: /^Options/ }).click();
  await expectDarkControl(page.locator("#provider"));
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "test-results/new-transcription-dark.png",
    fullPage: true,
  });

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expectDarkControl(page.locator("#history-sort"));
  await page.screenshot({
    path: "test-results/library-dark.png",
    fullPage: true,
  });

  await page.goto("/settings");

  await selectAppearance("Light");
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await selectAppearance("System");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("transcription progress counter clips inactive digits", async ({
  page,
}) => {
  const job = {
    id: "counter-test",
    title: "Meeting notes",
    filename: "meeting.wav",
    duration: 53,
    preset: "balanced",
    state: "transcribing",
    progress: 5,
    backend: "mlx",
    provider: "local",
    created: Date.now() / 1000 - 8,
    started: Date.now() / 1000 - 6,
    revision: 0,
    language: "auto",
    source_available: true,
    playback_available: false,
    segments: [],
  };
  await page.route("**/api/jobs/counter-test", (route) =>
    route.fulfill({ json: job }),
  );

  await page.goto("/jobs/counter-test");
  const counter = page.locator(".processing-percentage number-flow-react");
  await expect(counter).toBeVisible();
  expect((await counter.boundingBox()).width).toBeLessThan(160);
  await page.screenshot({
    path: "test-results/transcription-progress.png",
    fullPage: true,
  });
});

test("video transcripts use synchronized video playback", async ({ page }) => {
  await page.route("**/api/jobs/video-test", (route) =>
    route.fulfill({
      json: {
        id: "video-test",
        title: "Video interview",
        filename: "interview.mp4",
        duration: 53,
        preset: "balanced",
        state: "completed",
        progress: 100,
        backend: "mlx",
        provider: "local",
        created: Date.now() / 1000 - 60,
        started: Date.now() / 1000 - 50,
        finished: Date.now() / 1000 - 10,
        revision: 0,
        detected_language: "en",
        language: "auto",
        source_available: true,
        playback_available: true,
        playback_kind: "video",
        has_video: true,
        template: {
          id: "interview",
          name: "Interview",
          description: "Answers, quotes, and follow-ups",
          bookmarks: ["Answer", "Quote", "Follow-up", "Concern"],
        },
        bookmarks: [],
        notes: { summary: "", chapters: [], topics: [] },
        segments: [
          {
            id: 1,
            start: 0,
            end: 53,
            text: "The interview begins.",
            original: "The interview begins.",
          },
        ],
      },
    }),
  );
  await page.route("**/api/jobs/video-test/video", (route) =>
    route.fulfill({ contentType: "video/mp4", body: Buffer.from([]) }),
  );

  await page.goto("/jobs/video-test");
  const video = page.getByLabel("Video interview video");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("src", "/api/jobs/video-test/video");
  await expect(video).not.toHaveAttribute("controls");
  await expect(page.locator("audio")).toHaveCount(0);
  await expect(
    page.getByRole("slider", { name: "Seek recording" }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="step-player-control"]')).toBeVisible();
  const player = page.locator(".player");
  const videoFrame = page.locator(".video-player-frame");
  const transcript = page.locator(".transcript");
  await expect(player).toHaveCSS("position", "static");
  expect((await videoFrame.boundingBox()).height).toBeLessThanOrEqual(420);
  await transcript.evaluate((element) =>
    element.scrollIntoView({ block: "start" }),
  );
  const playerBox = await player.boundingBox();
  const transcriptBox = await transcript.boundingBox();
  expect(transcriptBox.y).toBeGreaterThanOrEqual(
    Math.min(0, playerBox.y + playerBox.height),
  );
  await page.screenshot({
    path: "test-results/video-player.png",
    fullPage: true,
  });
});

test("keyboard import, cancellation, retry, undo, and navigation saves", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "New transcription" }),
  ).toBeVisible();
  expect(
    await page
      .locator("main > section")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  for (let i = 0; i < 20; i++) {
    if (await page.evaluate(() => document.activeElement.id === "file-input"))
      break;
    await page.keyboard.press("Tab");
  }
  await expect(page.locator("#file-input")).toBeFocused();
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (
    await chooser
  ).setFiles({
    name: "Keyboard session.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  await expect(page.locator("#recording-title")).toBeVisible();
  await page.getByRole("button", { name: "Start transcription" }).click();
  await page.getByRole("button", { name: "Cancel transcription" }).click();
  await page.getByRole("button", { name: "Stop transcription" }).click();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("#transcript-title")).toBeVisible({
    timeout: 15000,
  });
  const text = page.getByRole("textbox", { name: "Segment at 00:00" });
  await text.fill("Temporary edit.");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(text).toHaveValue("Every voice has a story.");
  await text.fill("Saved on the way out.");
  const route = page.url();
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await page.goto(route);
  await expect(text).toHaveValue("Saved on the way out.");
});

test("model download shows measured progress, survives reload, and verifies before ready", async ({
  page,
}) => {
  await mockSystemNotifications(page);
  let state = {
    installed: false,
    downloading: false,
    phase: "available",
    progress: null,
    total_bytes: null,
    downloaded_bytes: 0,
    error: null,
  };
  await page.route("**/api/environment", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.presets.fast = { ...body.presets.fast, ...state };
    body.models = body.models.map((model) =>
      model.id === "small" ? { ...model, ...state } : model,
    );
    await route.fulfill({ json: body });
  });
  await page.route("**/api/models/small", async (route) => {
    if (route.request().method() === "DELETE") {
      state = { ...state, phase: "available", installed: false };
      await route.fulfill({ json: { deleted: true, model: "small" } });
    } else {
      state = {
        ...state,
        downloading: true,
        phase: "downloading",
        progress: 25,
        total_bytes: 100000000,
        downloaded_bytes: 25000000,
      };
      await route.fulfill({ json: state });
    }
  });
  await page.goto("/settings");
  await page.getByRole("link", { name: "Models", exact: true }).click();
  await page.getByPlaceholder("Search models").fill("small");
  await expect(page.locator(".model-row")).toHaveCount(1);
  await page
    .locator('.model-row[data-model="small"]')
    .getByRole("button", { name: "Install", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Download model", exact: true })
    .click();
  const bar = page.getByRole("progressbar", { name: "Small model download" });
  await expect(bar).toHaveAttribute("aria-valuenow", "25");
  await expect(
    page.getByRole("status").filter({ hasText: "25%" }),
  ).toContainText("25.0 MB / 100.0 MB");
  state = { ...state, progress: 70, downloaded_bytes: 70000000 };
  await expect(bar).toHaveAttribute("aria-valuenow", "70", { timeout: 6000 });
  await page.reload();
  await expect(bar).toHaveAttribute("aria-valuenow", "70");
  state = {
    ...state,
    phase: "verifying",
    progress: 100,
    downloaded_bytes: 100000000,
  };
  await expect(page.getByText("Verifying…", { exact: true })).toBeVisible({
    timeout: 6000,
  });
  await expect(bar).toHaveAttribute("aria-valuenow", "100");
  state = { ...state, phase: "ready", downloading: false, installed: true };
  await expect(bar).toHaveCount(0, { timeout: 6000 });
  await expect(page.locator(".model-row").first()).toContainText("Installed");
  const completedToast = page
    .locator("[data-sileo-toast]")
    .filter({ hasText: "Model ready" });
  await expect(completedToast).toContainText(
    "Small finished downloading and can now be selected for transcription.",
  );
  await expect(
    completedToast.getByRole("link", { name: "Open settings" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.systemNotifications))
    .toContainEqual({
      title: "Model download completed",
      body: "Small is ready to use.",
    });
  await page
    .locator('.model-row[data-model="small"]')
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(
    page.locator('.model-row[data-model="small"]'),
  ).not.toContainText("Installed");
  await page
    .locator('.model-row[data-model="small"]')
    .getByRole("button", { name: "Install", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Download model", exact: true })
    .click();
  state = {
    ...state,
    phase: "failed",
    downloading: false,
    installed: false,
    error: "Download interrupted.",
  };
  await expect
    .poll(() => page.evaluate(() => window.systemNotifications), {
      timeout: 6000,
    })
    .toContainEqual({
      title: "Model download failed",
      body: "Download interrupted.",
    });
  const failedToast = page
    .locator("[data-sileo-toast]")
    .filter({ hasText: "Download failed" });
  await expect(failedToast).toContainText("Download interrupted.");
  await expect(failedToast.getByRole("link", { name: "Retry" })).toBeVisible();
});

test("drop recording anywhere on stage and replace it", async ({ page }) => {
  await page.goto("/");
  const stage = page.locator(".capture-stage");
  const transfer = await page.evaluateHandle(
    (bytes) => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array(bytes)], "Dropped.wav", { type: "audio/wav" }),
      );
      return data;
    },
    [...wav()],
  );
  await stage.dispatchEvent("dragenter", { dataTransfer: transfer });
  await expect(stage).toHaveAttribute("data-dragging", "true");
  await page
    .locator(".capture-orb")
    .dispatchEvent("dragenter", { dataTransfer: transfer });
  await page
    .locator(".capture-orb")
    .dispatchEvent("dragleave", { dataTransfer: transfer });
  await expect(stage).toHaveAttribute("data-dragging", "true");
  await stage.dispatchEvent("dragleave", { dataTransfer: transfer });
  await expect(stage).toHaveAttribute("data-dragging", "false");
  await stage.dispatchEvent("dragenter", { dataTransfer: transfer });
  await stage.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator("#recording-title")).toHaveValue("Dropped");
  await expect(stage).toHaveAttribute("data-dragging", "false");
  await page.locator("#recording-title").fill("Renamed");
  await stage.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator("#recording-title")).toHaveValue("Dropped");
  await transfer.dispose();
});
