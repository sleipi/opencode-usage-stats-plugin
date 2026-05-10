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

  test("getRootSessions filters by directory", () => {
    const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
    cleanupDirs.push(dir);

    const repos = createSqliteRepos(dbPath);
    repos.sessions.upsertFull({
      sessionId: "s-a",
      projectId: "p1",
      parentId: null,
      title: "Session A",
      directory: "/projects/alpha",
    });
    repos.sessions.upsertFull({
      sessionId: "s-b",
      projectId: "p2",
      parentId: null,
      title: "Session B",
      directory: "/projects/beta",
    });

    const filtered = repos.sessions.getRootSessions("/projects/alpha");
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.session_id).toBe("s-a");

    const all = repos.sessions.getRootSessions();
    expect(all.length).toBe(2);

    repos.close();
  });

  test("getDistinctDirectories returns unique sorted directories", () => {
    const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
    cleanupDirs.push(dir);

    const repos = createSqliteRepos(dbPath);
    repos.sessions.upsertFull({
      sessionId: "s-1",
      projectId: "p1",
      parentId: null,
      title: "A",
      directory: "/projects/beta",
    });
    repos.sessions.upsertFull({
      sessionId: "s-2",
      projectId: "p1",
      parentId: null,
      title: "B",
      directory: "/projects/alpha",
    });
    repos.sessions.upsertFull({
      sessionId: "s-3",
      projectId: "p1",
      parentId: null,
      title: "C",
      directory: "/projects/beta",
    });

    const dirs = repos.sessions.getDistinctDirectories();
    expect(dirs).toEqual(["/projects/alpha", "/projects/beta"]);

    repos.close();
  });

  test("getDistinctDirectories excludes null directories", () => {
    const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
    cleanupDirs.push(dir);

    const repos = createSqliteRepos(dbPath);
    repos.sessions.upsert({ sessionId: "s-null", projectId: "p1" });
    repos.sessions.upsertFull({
      sessionId: "s-with-dir",
      projectId: "p1",
      parentId: null,
      title: "Has dir",
      directory: "/projects/gamma",
    });

    const dirs = repos.sessions.getDistinctDirectories();
    expect(dirs).toEqual(["/projects/gamma"]);

    repos.close();
  });
});
