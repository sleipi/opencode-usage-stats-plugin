import { expect, test } from "@playwright/test";

test.describe("daily chart", () => {
  test("renders daily token usage chart with title", async ({ page }) => {
    await page.goto("/");

    const chart = page.locator(".daily-chart").first();
    await expect(chart).toBeVisible();
    await expect(
      chart.locator(".chart-title", {
        hasText: "Daily Token Usage (last 60 days)",
      }),
    ).toBeVisible();
  });

  test("renders bar columns in chart container", async ({ page }) => {
    await page.goto("/");

    const container = page
      .locator(".daily-chart")
      .first()
      .locator(".chart-container");
    await expect(container).toBeVisible();

    const cols = container.locator(".chart-col");
    // 60 days of bars
    await expect(cols).toHaveCount(60);
  });

  test("renders 5-day moving average SVG polyline", async ({ page }) => {
    await page.goto("/");

    const svg = page
      .locator(".daily-chart")
      .first()
      .locator("svg.chart-avg-line");
    await expect(svg).toBeVisible();

    const polyline = svg.locator("polyline");
    await expect(polyline).toHaveCount(1);

    const points = await polyline.getAttribute("points");
    expect(points).toBeTruthy();
    expect(points!.split(" ").length).toBe(60);
  });

  test("renders chart legend with daily tokens and 5-day avg", async ({
    page,
  }) => {
    await page.goto("/");

    const legend = page
      .locator(".daily-chart")
      .first()
      .locator(".chart-legend");
    await expect(
      legend.locator(".legend-item", { hasText: "Daily tokens" }),
    ).toBeVisible();
    await expect(
      legend.locator(".legend-item", { hasText: "5-day avg" }),
    ).toBeVisible();
  });

  test("shows non-zero bars for seeded days", async ({ page }) => {
    await page.goto("/");

    // At least some bars should have height > 0 (non-empty style)
    const barsWithHeight = page
      .locator(".daily-chart")
      .first()
      .locator(".chart-bar[style*='height']");
    const count = await barsWithHeight.count();
    expect(count).toBeGreaterThan(0);
  });
});
