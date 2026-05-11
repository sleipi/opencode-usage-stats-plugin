import { expect, test } from "@playwright/test";

test.describe("subagent aggregation", () => {
  test("child session is not rendered as a separate session card", async ({
    page,
  }) => {
    await page.goto("/");

    // The child session has title "@explore subagent" - it should NOT appear as its own card
    const cards = page.locator(".session-card");
    const count = await cards.count();

    // We seeded 2 root sessions + 1 child. Only 2 cards should render.
    expect(count).toBe(2);

    // Verify the child title does not appear as a standalone card title
    await expect(
      page.locator(".session-title", { hasText: "@explore subagent" }),
    ).not.toBeVisible();
  });

  test("parent session card shows agent row from subagent", async ({
    page,
  }) => {
    await page.goto("/");

    const parentCard = page.locator(".session-card", {
      hasText: "E2E Session",
    });

    // The child session title "@explore subagent" should produce an "explore" agent badge
    await expect(
      parentCard.locator(".agent-badge", { hasText: "explore" }),
    ).toBeVisible();
  });

  test("parent session tokens include child session tokens", async ({
    page,
  }) => {
    await page.goto("/");

    const parentCard = page.locator(".session-card", {
      hasText: "E2E Session",
    });
    const tokenIn = parentCard.locator(".session-tokens .token-in");
    await expect(tokenIn).toBeVisible();
    const text = await tokenIn.textContent();

    // Parent input=2000, cache=1000 + child input=400, cache=200
    // renderTokens shows totalIn = input+cache = 2400+1200 = 3600 => "3.6k in"
    expect(text).toContain("3.6k");
  });
});
