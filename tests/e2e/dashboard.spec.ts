import { expect, test } from "@playwright/test"

test("dashboard page renders seeded data", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByRole("heading", { name: "OpenCode Usage Stats" })).toBeVisible()
  await expect(page.getByText("E2E Session")).toBeVisible()
  await expect(page.getByText("/tmp/e2e-project")).toBeVisible()
  await expect(page.getByText("Tool Usage")).toBeVisible()
})

test("stats fragment endpoint returns session card html", async ({ page, request }) => {
  const response = await request.get("/api/stats")
  expect(response.ok()).toBe(true)
  const html = await response.text()
  expect(html).toContain("session-card")
  expect(html).toContain("E2E Session")

  await page.goto("/")
  await expect(page.locator(".session-card").first()).toBeVisible()
})
