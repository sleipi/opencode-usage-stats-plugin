import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { createSqliteRepos, gcOldData } from "../../src/db/sqlite-repository";
import { cleanupTempDir, createTempDbPath } from "./helpers/temp-db";

describe("sqlite repository factory", () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (dir) cleanupTempDir(dir);
    }
  });

  test("readonly repos reject unsupported future schema", () => {
    const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
    cleanupDirs.push(dir);

    const db = new Database(dbPath);
    db.run("PRAGMA user_version = 999");
    db.close();

    expect(() => createSqliteRepos(dbPath, { readonly: true })).toThrow();
  });

  test("gcOldData removes old messages/tool calls and orphan sessions", () => {
    const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);
    const db = new Database(dbPath);

    db.prepare(
      "INSERT INTO sessions (session_id, first_seen, last_seen) VALUES (?, ?, ?)",
    ).run("old-session", "2025-01-01 10:00:00", "2025-01-01 10:00:00");
    db.prepare(
      "INSERT INTO sessions (session_id, first_seen, last_seen) VALUES (?, ?, ?)",
    ).run("new-session", "2026-05-01 10:00:00", "2026-05-01 10:00:00");
    db.prepare(
      "INSERT INTO messages (session_id, message_id, role, timestamp) VALUES ('old-session', 'old-msg', 'assistant', '2025-01-01 10:00:00')",
    ).run();
    db.prepare(
      "INSERT INTO messages (session_id, message_id, role, timestamp) VALUES ('new-session', 'new-msg', 'assistant', '2026-05-01 10:00:00')",
    ).run();
    db.prepare(
      "INSERT INTO tool_calls (session_id, call_id, tool_name, timestamp) VALUES ('old-session', 'old-call', 'bash', '2025-01-01 10:00:00')",
    ).run();
    db.prepare(
      "INSERT INTO tool_calls (session_id, call_id, tool_name, timestamp) VALUES ('new-session', 'new-call', 'bash', '2026-05-01 10:00:00')",
    ).run();
    db.close();

    gcOldData(repos, 180);

    const check = new Database(dbPath, { readonly: true });
    const msgIds = check
      .prepare("SELECT message_id FROM messages ORDER BY message_id")
      .all() as Array<{ message_id: string }>;
    const callIds = check
      .prepare("SELECT call_id FROM tool_calls ORDER BY call_id")
      .all() as Array<{ call_id: string }>;
    const sessions = check
      .prepare("SELECT session_id FROM sessions ORDER BY session_id")
      .all() as Array<{ session_id: string }>;

    expect(msgIds.map((r) => r.message_id)).toEqual(["new-msg"]);
    expect(callIds.map((r) => r.call_id)).toEqual(["new-call"]);
    expect(sessions.map((r) => r.session_id)).toEqual(["new-session"]);

    check.close();
    repos.close();
  });
});
