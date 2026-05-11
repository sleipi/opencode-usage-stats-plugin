import { expect, test } from "@playwright/test";

test.describe("session card details", () => {
  test("renders session title and directory", async ({ page }) => {
    await page.goto("/");

    const card = page.locator(".session-card", { hasText: "E2E Session" });
    await expect(card).toBeVisible();
    await expect(
      card.locator(".session-title", { hasText: "E2E Session" }),
    ).toBeVisible();
    await expect(
      card.locator(".session-dir", { hasText: "/tmp/e2e-project" }),
    ).toBeVisible();
  });

  test("renders session ID", async ({ page }) => {
    await page.goto("/");

    const card = page.locator(".session-card", { hasText: "E2E Session" });
    await expect(
      card.locator(".session-id", { hasText: "session-e2e-1" }),
    ).toBeVisible();
  });

  test("renders session-level token breakdown", async ({ page }) => {
    await page.goto("/");

    const card = page.locator(".session-card", { hasText: "E2E Session" });
    const tokenSection = card.locator(".session-tokens");
    await expect(tokenSection).toBeVisible();
    await expect(
      tokenSection.locator(".token-label", { hasText: "Tokens:" }),
    ).toBeVisible();
    // renderTokens outputs .token-in and .token-out spans directly (no wrapper)
    await expect(tokenSection.locator(".token-in")).toBeVisible();
    await expect(tokenSection.locator(".token-out")).toBeVisible();
  });

  test("renders mode rows with plan and build badges", async ({ page }) => {
    await page.goto("/");

    const card = page.locator(".session-card", { hasText: "E2E Session" });

    // Session 1 has both build and plan messages
    await expect(
      card.locator(".mode-badge.mode-build", { hasText: "Build" }),
    ).toBeVisible();
    await expect(
      card.locator(".mode-badge.mode-plan", { hasText: "Plan" }),
    ).toBeVisible();
  });

  test("mode rows show message count and token details", async ({ page }) => {
    await page.goto("/");

    const card = page.locator(".session-card", { hasText: "E2E Session" });
    const modeRows = card.locator(".mode-row");
    const count = await modeRows.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Each mode row should have message count and token detail
    for (let i = 0; i < count; i++) {
      const row = modeRows.nth(i);
      await expect(row.locator(".mode-msgs")).toBeVisible();
      await expect(row.locator(".tokens-detail")).toBeVisible();
    }
  });

  test("renders session timestamp", async ({ page }) => {
    await page.goto("/");

    const card = page.locator(".session-card", { hasText: "E2E Session" });
    const time = card.locator(".session-time");
    await expect(time).toBeVisible();

    const text = await time.textContent();
    // Should contain a date-like string (YYYY-MM-DD HH:MM format)
    expect(text).toMatch(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/);
  });
});
