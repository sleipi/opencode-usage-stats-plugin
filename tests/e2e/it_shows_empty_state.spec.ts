import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const emptyDbPath = join(
  tmpdir(),
  "opencode",
  `opencode-usage-stats-e2e-empty-${process.pid}.db`,
);
const emptyPort = 43435;

test.describe("empty state", () => {
  test.describe.configure({ mode: "serial" });

  let serverProcess: import("node:child_process").ChildProcess;

  test.beforeAll(async () => {
    const { execSync, spawn } = await import("node:child_process");

    // Seed empty DB with unique path
    execSync(
      `OPENCODE_USAGE_STATS_DB=${emptyDbPath} bun run tests/e2e/seed-empty-db.ts`,
    );

    // Start dashboard on separate port
    serverProcess = spawn("bun", ["run", "src/dashboard.ts"], {
      env: {
        ...process.env,
        OPENCODE_USAGE_STATS_DB: emptyDbPath,
        PORT: String(emptyPort),
      },
      stdio: "pipe",
    });

    // Wait for server to be ready
    const maxWait = 10_000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      try {
        const res = await fetch(`http://127.0.0.1:${emptyPort}/`);
        if (res.ok) break;
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  test.afterAll(async () => {
    serverProcess?.kill();
    const { rmSync } = await import("node:fs");
    rmSync(emptyDbPath, { force: true });
  });

  test("shows empty state message when no sessions exist", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: `http://127.0.0.1:${emptyPort}`,
    });
    const page = await context.newPage();

    await page.goto("/");

    await expect(
      page.locator(".empty", { hasText: "No sessions recorded yet." }),
    ).toBeVisible();
    await expect(page.locator(".session-card")).toHaveCount(0);

    await context.close();
  });

  test("stats bar still renders with zero values", async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: `http://127.0.0.1:${emptyPort}`,
    });
    const page = await context.newPage();

    await page.goto("/");

    await expect(page.locator(".stats-bar").first()).toBeVisible();

    await context.close();
  });
});
