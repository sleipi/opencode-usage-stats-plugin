import { expect, test } from "@playwright/test";

test.describe("model chart", () => {
  test("renders model chart with title", async ({ page }) => {
    await page.goto("/");

    // The model chart is the second .daily-chart
    const modelChart = page.locator(".daily-chart").nth(1);
    await expect(modelChart).toBeVisible();
    await expect(
      modelChart.locator(".chart-title", {
        hasText: "Daily Token Usage by Model",
      }),
    ).toBeVisible();
  });

  test("renders 60 bar columns", async ({ page }) => {
    await page.goto("/");

    const modelChart = page.locator(".daily-chart").nth(1);
    const cols = modelChart.locator(".chart-container .chart-col");
    await expect(cols).toHaveCount(60);
  });

  test("renders stacked bar segments for days with data", async ({ page }) => {
    await page.goto("/");

    const modelChart = page.locator(".daily-chart").nth(1);
    const segments = modelChart.locator(".model-bar-seg");
    const count = await segments.count();
    expect(count).toBeGreaterThan(0);
  });

  test("renders legend with seeded model names", async ({ page }) => {
    await page.goto("/");

    const modelChart = page.locator(".daily-chart").nth(1);
    const legend = modelChart.locator(".chart-legend");

    // We seeded gpt-5.3-codex and claude-sonnet-4
    await expect(
      legend.locator(".legend-item", { hasText: "gpt-5.3-codex" }),
    ).toBeVisible();
    await expect(
      legend.locator(".legend-item", { hasText: "claude-sonnet-4" }),
    ).toBeVisible();
  });
});
