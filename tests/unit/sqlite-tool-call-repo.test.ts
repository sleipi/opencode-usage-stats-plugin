import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { createSqliteRepos } from "../../src/db/sqlite-repository";
import { cleanupTempDir, createTempDbPath } from "./helpers/temp-db";

describe("sqlite tool call repo", () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (dir) cleanupTempDir(dir);
    }
  });

  test("deduplicates call_id and aggregates agent calls", () => {
    const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);

    repos.toolCalls.insert({
      sessionId: "s1",
      callId: "dup",
      toolName: "task",
      agentType: "general",
      description: "run",
      agent: "build",
      modelId: "m",
      providerId: "p",
    });
    repos.toolCalls.insert({
      sessionId: "s1",
      callId: "dup",
      toolName: "task",
      agentType: "general",
      description: "run",
      agent: "build",
      modelId: "m",
      providerId: "p",
    });

    const db = new Database(dbPath, { readonly: true });
    const countRow = db
      .prepare("SELECT COUNT(*) AS count FROM tool_calls WHERE call_id = 'dup'")
      .get() as { count: number };
    expect(countRow.count).toBe(1);
    db.close();

    const agentCalls = repos.toolCalls.getAgentCalls();
    expect(agentCalls.length).toBe(1);
    expect(agentCalls[0]?.agent_type).toBe("general");
    expect(agentCalls[0]?.call_count).toBe(1);

    const summary = repos.toolCalls.getToolUsageSummary();
    expect(summary.length).toBe(1);
    expect(summary[0]?.tools[0]?.tool_name).toBe("task");

    repos.close();
  });
});
