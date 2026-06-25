import { expect, test } from "@playwright/test";

test.describe("two-column layout", () => {
  test("renders two-column container", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".two-col")).toBeVisible();
  });

  test("left panel contains stats bar and charts", async ({ page }) => {
    await page.goto("/");

    const leftPanel = page.locator(".left-panel");
    await expect(leftPanel).toBeVisible();

    await expect(leftPanel.locator(".stats-bar").first()).toBeVisible();
    await expect(leftPanel.locator(".daily-chart")).toHaveCount(4);
  });

  test("right panel contains directory filter and session cards", async ({
    page,
  }) => {
    await page.goto("/");

    const rightPanel = page.locator(".right-panel");
    await expect(rightPanel).toBeVisible();

    await expect(rightPanel.locator("#dir-filter")).toBeVisible();
    await expect(rightPanel.locator(".session-card").first()).toBeVisible();
  });

  test("left panel and right panel are siblings inside two-col", async ({
    page,
  }) => {
    await page.goto("/");

    const twoCol = page.locator(".two-col");
    await expect(twoCol.locator("> .left-panel")).toBeVisible();
    await expect(twoCol.locator("> .right-panel")).toBeVisible();
  });
});
