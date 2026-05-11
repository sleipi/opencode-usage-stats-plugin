import { expect, test } from "@playwright/test";

test.describe("auto-refresh", () => {
  test("page contains auto-refresh indicator", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".refresh-badge")).toBeVisible();
    await expect(page.getByText("auto-refresh 5s")).toBeVisible();
  });

  test("auto-refresh fetches /api/stats periodically", async ({ page }) => {
    await page.goto("/");

    // Wait for an auto-refresh fetch to /api/stats
    const response = await page.waitForResponse(
      (resp) => resp.url().includes("/api/stats") && resp.status() === 200,
      { timeout: 10_000 },
    );

    expect(response.ok()).toBe(true);
  });

  test("refresh timing indicator updates after refresh", async ({ page }) => {
    await page.goto("/");

    // Wait for a refresh cycle
    await page.waitForResponse((resp) => resp.url().includes("/api/stats"), {
      timeout: 10_000,
    });

    const timing = page.locator("#refresh-timing");
    await expect(timing).not.toBeEmpty();

    const text = await timing.textContent();
    expect(text).toMatch(/took \d+ms/);
  });
});
