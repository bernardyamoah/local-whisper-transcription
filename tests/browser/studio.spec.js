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
    page.getByRole("heading", { name: "Let your words settle in." }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "Delete…" }).click();
  await page.getByRole("button", { name: "Delete selected items" }).click();
  await expect(
    page.getByRole("heading", { name: "Your library." }),
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
      page.getByRole("heading", { name: "Let your words settle in." }),
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
    await page.getByRole("link", { name: "Studio settings" }).click();
    await expect(
      page.getByRole("heading", { name: "Your studio, your way." }),
    ).toBeVisible();
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
    page.getByRole("heading", { name: "Let your words settle in." }),
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
  await page.getByRole("link", { name: "Your library" }).click();
  await expect(
    page.getByRole("heading", { name: "Your library." }),
  ).toBeVisible();
  await page.goto(route);
  await expect(text).toHaveValue("Saved on the way out.");
});
