import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { createSqliteRepos } from "../../src/db/sqlite-repository";
import { cleanupTempDir, createTempDbPath } from "./helpers/temp-db";

describe("sqlite message repo", () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (dir) cleanupTempDir(dir);
    }
  });

  test("upsert updates existing row and keeps non-null agent", () => {
    const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);

    repos.messages.upsert({
      sessionId: "s1",
      messageId: "m1",
      role: "assistant",
      modelId: "model-a",
      providerId: "prov-a",
      inputTokens: 1,
      outputTokens: 2,
      reasoningTokens: 3,
      cacheReadTokens: 4,
      cacheWriteTokens: 5,
      cost: 0.1,
      agent: "plan",
    });

    repos.messages.upsert({
      sessionId: "s1",
      messageId: "m1",
      role: "assistant",
      modelId: "model-b",
      providerId: "prov-b",
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 30,
      cacheReadTokens: 40,
      cacheWriteTokens: 50,
      cost: 1.5,
      agent: null,
    });

    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare(`
      SELECT model_id, provider_id, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cache_write_tokens, cost, agent
      FROM messages WHERE session_id = 's1' AND message_id = 'm1'
    `)
      .get() as {
      model_id: string;
      provider_id: string;
      input_tokens: number;
      output_tokens: number;
      reasoning_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
      cost: number;
      agent: string | null;
    };

    expect(row.model_id).toBe("model-b");
    expect(row.provider_id).toBe("prov-b");
    expect(row.input_tokens).toBe(10);
    expect(row.output_tokens).toBe(20);
    expect(row.reasoning_tokens).toBe(30);
    expect(row.cache_read_tokens).toBe(40);
    expect(row.cache_write_tokens).toBe(50);
    expect(row.cost).toBe(1.5);
    expect(row.agent).toBe("plan");

    db.close();
    repos.close();
  });

  test("getTodayCost returns sum of cost for today", () => {
    const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);
    const today = new Date().toISOString().slice(0, 10);

    repos.messages.upsert({
      sessionId: "s1",
      messageId: "m1",
      role: "assistant",
      modelId: "model-a",
      providerId: "prov-a",
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cost: 0.05,
      agent: null,
    });

    const result = repos.messages.getTodayCost(today);
    expect(result.date).toBe(today);
    expect(result.total).toBeCloseTo(0.05);

    repos.close();
  });

  test("getDailyModelCost groups cost by date and model", () => {
    const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);

    repos.messages.upsert({
      sessionId: "s1",
      messageId: "m1",
      role: "assistant",
      modelId: "sonnet",
      providerId: "anthropic",
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cost: 0.1,
      agent: null,
    });
    repos.messages.upsert({
      sessionId: "s1",
      messageId: "m2",
      role: "assistant",
      modelId: "sonnet",
      providerId: "anthropic",
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cost: 0.2,
      agent: null,
    });

    const result = repos.messages.getDailyModelCost();
    const today = new Date().toISOString().slice(0, 10);
    const row = result.find(
      (r) => r.date === today && r.model === "anthropic / sonnet",
    );
    expect(row?.total).toBeCloseTo(0.3);

    repos.close();
  });
});
