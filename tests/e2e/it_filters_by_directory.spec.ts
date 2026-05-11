import { expect, test } from "@playwright/test";

test.describe("directory filter", () => {
  test("renders directory filter dropdown", async ({ page }) => {
    await page.goto("/");

    const dropdown = page.locator("#dir-filter");
    await expect(dropdown).toBeVisible();
  });

  test("dropdown has 'All directories' as default option", async ({ page }) => {
    await page.goto("/");

    const defaultOption = page.locator("#dir-filter option[value='']");
    await expect(defaultOption).toHaveText("All directories");
  });

  test("dropdown lists seeded directories", async ({ page }) => {
    await page.goto("/");

    const dropdown = page.locator("#dir-filter");
    const options = dropdown.locator("option");
    const count = await options.count();

    // "All directories" + at least 2 seeded dirs
    expect(count).toBeGreaterThanOrEqual(3);

    const texts = await options.allTextContents();
    expect(texts).toContain("/tmp/e2e-project");
    expect(texts).toContain("/tmp/e2e-other");
  });

  test("selecting a directory filters sessions", async ({ page }) => {
    await page.goto("/");

    // Initially both sessions visible
    await expect(
      page.locator(".session-card", { hasText: "E2E Session" }),
    ).toBeVisible();
    await expect(
      page.locator(".session-card", { hasText: "Other Session" }),
    ).toBeVisible();

    // Select /tmp/e2e-other
    await page.locator("#dir-filter").selectOption("/tmp/e2e-other");

    // Wait for refresh to apply the filter
    await page.waitForResponse((resp) =>
      resp.url().includes("/api/stats?dir="),
    );

    // Only "Other Session" should be visible
    await expect(
      page.locator(".session-card", { hasText: "Other Session" }),
    ).toBeVisible();
    await expect(
      page.locator(".session-card", { hasText: "E2E Session" }),
    ).not.toBeVisible();
  });

  test("page loaded with ?dir= query param filters sessions", async ({
    page,
  }) => {
    await page.goto("/?dir=/tmp/e2e-other");

    await expect(
      page.locator(".session-card", { hasText: "Other Session" }),
    ).toBeVisible();
    await expect(
      page.locator(".session-card", { hasText: "E2E Session" }),
    ).not.toBeVisible();
  });
});
