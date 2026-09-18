import { test, expect } from "@playwright/test";
test("recording window appearance", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Record meeting", exact: true })
    .click();
  await expect(
    page.getByText("We should ship the live meeting view."),
  ).toBeVisible();
  for (const [theme, width] of [
    ["light", 1280],
    ["dark", 1280],
    ["light", 390],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      (theme) =>
        document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    await page.waitForTimeout(350);
    await page.screenshot({ path: `/tmp/recording-${theme}-${width}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
});
