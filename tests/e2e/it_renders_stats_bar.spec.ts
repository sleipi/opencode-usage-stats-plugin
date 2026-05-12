import { expect, test } from "@playwright/test";

test.describe("stats bar", () => {
  test("renders stats bar with token summary periods", async ({ page }) => {
    await page.goto("/");

    const statsBar = page.locator(".stats-bar").first();
    await expect(statsBar).toBeVisible();

    await expect(
      statsBar.locator(".stats-label", { hasText: "Today:" }),
    ).toBeVisible();
    await expect(
      statsBar.locator(".stats-label", { hasText: "This Week:" }),
    ).toBeVisible();
    await expect(
      statsBar.locator(".stats-label", { hasText: "This Month:" }),
    ).toBeVisible();
    await expect(
      statsBar.locator(".stats-label", { hasText: "Last Month:" }),
    ).toBeVisible();
  });

  test("displays non-zero token values for seeded data", async ({ page }) => {
    await page.goto("/");

    const tokenBar = page.locator(".stats-bar").first();
    const values = tokenBar.locator(".stats-value");
    const count = await values.count();
    expect(count).toBe(4);

    // Today should show non-zero because we seeded messages with timestamps from today
    const todayValue = await values.nth(0).textContent();
    expect(todayValue).not.toBe("0");
  });

  test("shows Overall mode badge", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.locator(".stats-bar .mode-badge.mode-overall", {
        hasText: "Overall",
      }),
    ).toBeVisible();
  });
});
