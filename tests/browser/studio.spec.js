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

test("import, process, edit, reload, search, copy, export and delete", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "New transcription" }),
  ).toBeVisible();
  await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute(
    "href",
    /\/assets\/.*\.css$/,
  );
  expect(
    await page
      .getByRole("heading", { name: "New transcription" })
      .evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain("Studio Serif");
  await page.locator("#file-input").setInputFiles({
    name: "A conversation.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  await expect(page.locator("#recording-title")).toHaveValue("A conversation");
  await page.getByRole("button", { name: "Start transcription" }).click();
  await expect(page.locator("#transcript-title")).toBeVisible({
    timeout: 15000,
  });
  const audio = page.locator("audio");
  const transport = page.locator('[data-slot="step-player-control"]');
  await transport.click();
  await expect
    .poll(() => audio.evaluate((element) => !element.paused))
    .toBe(true);
  await transport.click();
  await expect
    .poll(() => audio.evaluate((element) => element.paused))
    .toBe(true);
  await page
    .locator('[data-slot="step-player-track"]')
    .getByRole("button", { name: "Play from 00:01" })
    .click();
  await expect
    .poll(() => audio.evaluate((element) => element.currentTime))
    .toBeGreaterThanOrEqual(1);
  await transport.click();
  const text = page.getByRole("textbox", { name: "Segment at 00:00" });
  await text.fill("A corrected thought, saved for later.");
  await expect(page.locator("#save-status")).toHaveText("All changes saved");
  await page.reload();
  await expect(text).toHaveValue("A corrected thought, saved for later.");
  await page.locator("#transcript-search").fill("corrected");
  await expect(page.locator("#match-count")).toHaveText("1 / 1");
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "A corrected thought",
  );
  for (const format of ["txt", "srt", "vtt"]) {
    await page.locator("#export-format").selectOption(format);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`A conversation.${format}`);
    const stream = await file.createReadStream();
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    expect(Buffer.concat(chunks).toString()).toContain("A corrected thought");
  }
  await page.screenshot({
    path: "test-results/editor-desktop.png",
    fullPage: true,
  });
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.locator("#delete-scope").selectOption("all");
  const deleteControl = page.locator(
    ".editor-foot [data-slot='delete-button']",
  );
  await deleteControl
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await deleteControl.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
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
    await page.getByLabel("Default quality").selectOption("fast");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.locator("#settings-saved")).toContainText(
      "Preferences saved",
    );
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
  await page.getByRole("link", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await page.goto(route);
  await expect(text).toHaveValue("Saved on the way out.");
});

test("model download shows measured progress, survives reload, and verifies before ready", async ({
  page,
}) => {
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
      model.id === "base" ? { ...model, ...state } : model,
    );
    await route.fulfill({ json: body });
  });
  await page.route("**/api/models/base", async (route) => {
    if (route.request().method() === "DELETE") {
      state = { ...state, phase: "available", installed: false };
      await route.fulfill({ json: { deleted: true, model: "base" } });
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
  await page.getByPlaceholder("Search models").fill("base");
  await expect(page.locator(".model-row")).toHaveCount(2);
  await page.getByPlaceholder("Search models").fill("base.en");
  await expect(page.locator(".model-row")).toHaveCount(1);
  await page.getByPlaceholder("Search models").fill("base");
  await page
    .locator('.model-row[data-model="base"]')
    .getByRole("button", { name: "Install", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Download model", exact: true })
    .click();
  const bar = page.getByRole("progressbar", { name: "Base model download" });
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
  await page
    .locator('.model-row[data-model="base"]')
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.locator('.model-row[data-model="base"]')).not.toContainText(
    "Installed",
  );
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
    .locator(".capture-wave")
    .dispatchEvent("dragenter", { dataTransfer: transfer });
  await page
    .locator(".capture-wave")
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
