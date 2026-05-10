import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { createSqliteRepos } from "../../src/db/sqlite-repository";
import { cleanupTempDir, createTempDbPath } from "./helpers/temp-db";

describe("sqlite session repo", () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (dir) cleanupTempDir(dir);
    }
  });

  test("upserts and returns root/child sessions", () => {
    const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
    cleanupDirs.push(dir);

    const repos = createSqliteRepos(dbPath);
    repos.sessions.upsertFull({
      sessionId: "root-1",
      projectId: "proj-1",
      parentId: null,
      title: "Root",
      directory: "/tmp/root",
    });
    repos.sessions.upsertFull({
      sessionId: "child-1",
      projectId: "proj-1",
      parentId: "root-1",
      title: "Child (@general subagent)",
      directory: "/tmp/root",
    });

    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO messages (session_id, message_id, role, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens)
      VALUES ('root-1', 'm-root', 'assistant', 10, 5, 1, 2)
    `).run();
    db.prepare(`
      INSERT INTO messages (session_id, message_id, role, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens)
      VALUES ('child-1', 'm-child', 'assistant', 3, 2, 1, 0)
    `).run();
    db.close();

    const roots = repos.sessions.getRootSessions();
    const children = repos.sessions.getChildSessions();

    expect(roots.length).toBe(1);
    expect(roots[0]?.session_id).toBe("root-1");
    expect(children.length).toBe(1);
    expect(children[0]?.session_id).toBe("child-1");
    expect(children[0]?.parent_id).toBe("root-1");

    repos.close();
  });
});
