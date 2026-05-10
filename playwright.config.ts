import { defineConfig } from "@playwright/test"

const testDbPath = "/var/folders/p2/0gbt1nps4m1_t9np42sx_kl00000gn/T/opencode/opencode-usage-stats-e2e.db"
const port = 43434

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `OPENCODE_USAGE_STATS_DB=${testDbPath} bun run tests/e2e/seed-db.ts && OPENCODE_USAGE_STATS_DB=${testDbPath} PORT=${port} bun run src/dashboard.ts`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
