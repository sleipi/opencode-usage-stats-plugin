import { expect, test } from "@playwright/test";

test.describe("session recency styling", () => {
  test("active session (last seen < 5 min ago) has active class", async ({
    page,
  }) => {
    await page.goto("/");

    // session-e2e-1 was last seen 2 min ago
    const activeCard = page.locator(".session-card", {
      hasText: "E2E Session",
    });
    await expect(activeCard).toBeVisible();
    await expect(activeCard).toHaveClass(/session-card--active/);
  });

  test("old session (last seen > 24h ago) has no recency class", async ({
    page,
  }) => {
    await page.goto("/");

    // session-e2e-2 was last seen 25 hours ago (> 24h = no class applied)
    const oldCard = page.locator(".session-card", { hasText: "Other Session" });
    await expect(oldCard).toBeVisible();

    const classList = await oldCard.getAttribute("class");
    expect(classList).not.toMatch(
      /session-card--(active|recent|idle|stale|old)/,
    );
  });
});
