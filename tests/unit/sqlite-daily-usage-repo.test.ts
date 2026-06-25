import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { createSqliteRepos } from "../../src/db/sqlite-repository";
import { cleanupTempDir, createTempDbPath } from "./helpers/temp-db";

describe("sqlite daily usage repo", () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (dir) cleanupTempDir(dir);
    }
  });

  test("recomputes and queries history", () => {
    const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);
    const db = new Database(dbPath);

    db.prepare(
      "INSERT INTO sessions (session_id, first_seen, last_seen) VALUES (?, ?, ?)",
    ).run("s1", "2026-05-01 10:00:00", "2026-05-01 10:00:00");
    db.prepare(`
      INSERT INTO messages (session_id, message_id, role, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cost, timestamp)
      VALUES ('s1', 'm1', 'assistant', 100, 50, 10, 20, 0.25, '2026-05-01 12:00:00')
    `).run();
    db.prepare(`
      INSERT INTO tool_calls (session_id, call_id, tool_name, timestamp)
      VALUES ('s1', 'c1', 'bash', '2026-05-01 12:01:00')
    `).run();
    db.close();

    repos.dailyUsage.recompute("2026-05-01", "2026-05-02");
    const history = repos.dailyUsage.getHistoryUntil("2026-05-03", 365);
    const row = history.find((r) => r.date === "2026-05-01");
    expect(row?.total).toBe(180);

    repos.close();
  });

  test("getHistoryUntilCost returns cost_total for rolled-up days", () => {
    const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);
    const db = new Database(dbPath);

    db.prepare(
      "INSERT INTO sessions (session_id, first_seen, last_seen) VALUES (?, ?, ?)",
    ).run("s1", "2026-05-01 10:00:00", "2026-05-01 10:00:00");
    db.prepare(`
      INSERT INTO messages (session_id, message_id, role, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cost, timestamp)
      VALUES ('s1', 'm1', 'assistant', 100, 50, 10, 20, 0.25, '2026-05-01 12:00:00')
    `).run();
    db.close();

    repos.dailyUsage.recompute("2026-05-01", "2026-05-02");
    const history = repos.dailyUsage.getHistoryUntilCost("2026-05-03", 365);
    const row = history.find((r) => r.date === "2026-05-01");
    expect(row?.total).toBeCloseTo(0.25);

    repos.close();
  });
});
