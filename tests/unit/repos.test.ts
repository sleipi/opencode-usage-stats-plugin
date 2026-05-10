import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createSqliteRepos, gcOldData } from "../../src/db/sqlite-repository"

function createTempDbPath(): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "opencode-usage-stats-repos-"))
  return { dir, dbPath: join(dir, "usage-stats.db") }
}

describe("sqlite repositories", () => {
  const cleanupDirs: string[] = []

  afterEach(() => {
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop()
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  })

  test("readonly repos reject unsupported future schema", () => {
    const { dir, dbPath } = createTempDbPath()
    cleanupDirs.push(dir)

    const db = new Database(dbPath)
    db.run("PRAGMA user_version = 999")
    db.close()

    expect(() => createSqliteRepos(dbPath, { readonly: true })).toThrow()
  })

  test("session repo upserts and returns root/child sessions", () => {
    const { dir, dbPath } = createTempDbPath()
    cleanupDirs.push(dir)

    const repos = createSqliteRepos(dbPath)
    repos.sessions.upsertFull({
      sessionId: "root-1",
      projectId: "proj-1",
      parentId: null,
      title: "Root",
      directory: "/tmp/root",
    })
    repos.sessions.upsertFull({
      sessionId: "child-1",
      projectId: "proj-1",
      parentId: "root-1",
      title: "Child (@general subagent)",
      directory: "/tmp/root",
    })

    const db = new Database(dbPath)
    db.prepare(`
      INSERT INTO messages (session_id, message_id, role, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens)
      VALUES ('root-1', 'm-root', 'assistant', 10, 5, 1, 2)
    `).run()
    db.prepare(`
      INSERT INTO messages (session_id, message_id, role, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens)
      VALUES ('child-1', 'm-child', 'assistant', 3, 2, 1, 0)
    `).run()
    db.close()

    const roots = repos.sessions.getRootSessions()
    const children = repos.sessions.getChildSessions()

    expect(roots.length).toBe(1)
    expect(roots[0]?.session_id).toBe("root-1")
    expect(children.length).toBe(1)
    expect(children[0]?.session_id).toBe("child-1")
    expect(children[0]?.parent_id).toBe("root-1")

    repos.close()
  })

  test("message repo upsert updates existing row and keeps non-null agent", () => {
    const { dir, dbPath } = createTempDbPath()
    cleanupDirs.push(dir)
    const repos = createSqliteRepos(dbPath)

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
    })

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
    })

    const db = new Database(dbPath, { readonly: true })
    const row = db.prepare(`
      SELECT model_id, provider_id, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cache_write_tokens, cost, agent
      FROM messages WHERE session_id = 's1' AND message_id = 'm1'
    `).get() as {
      model_id: string
      provider_id: string
      input_tokens: number
      output_tokens: number
      reasoning_tokens: number
      cache_read_tokens: number
      cache_write_tokens: number
      cost: number
      agent: string | null
    }

    expect(row.model_id).toBe("model-b")
    expect(row.provider_id).toBe("prov-b")
    expect(row.input_tokens).toBe(10)
    expect(row.output_tokens).toBe(20)
    expect(row.reasoning_tokens).toBe(30)
    expect(row.cache_read_tokens).toBe(40)
    expect(row.cache_write_tokens).toBe(50)
    expect(row.cost).toBe(1.5)
    expect(row.agent).toBe("plan")

    db.close()
    repos.close()
  })

  test("daily usage repo recomputes and history can be queried", () => {
    const { dir, dbPath } = createTempDbPath()
    cleanupDirs.push(dir)
    const repos = createSqliteRepos(dbPath)
    const db = new Database(dbPath)

    db.prepare("INSERT INTO sessions (session_id, first_seen, last_seen) VALUES (?, ?, ?)").run(
      "s1",
      "2026-05-01 10:00:00",
      "2026-05-01 10:00:00",
    )
    db.prepare(`
      INSERT INTO messages (session_id, message_id, role, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cost, timestamp)
      VALUES ('s1', 'm1', 'assistant', 100, 50, 10, 20, 0.25, '2026-05-01 12:00:00')
    `).run()
    db.prepare(`
      INSERT INTO tool_calls (session_id, call_id, tool_name, timestamp)
      VALUES ('s1', 'c1', 'bash', '2026-05-01 12:01:00')
    `).run()
    db.close()

    repos.dailyUsage.recompute("2026-05-01", "2026-05-02")
    const history = repos.dailyUsage.getHistoryUntil("2026-05-03", 60)
    const row = history.find((r) => r.date === "2026-05-01")
    expect(row?.total).toBe(180)

    repos.close()
  })

  test("tool call repo deduplicates call_id and aggregates agent calls", () => {
    const { dir, dbPath } = createTempDbPath()
    cleanupDirs.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.toolCalls.insert({
      sessionId: "s1",
      callId: "dup",
      toolName: "task",
      agentType: "general",
      description: "run",
      agent: "build",
      modelId: "m",
      providerId: "p",
    })
    repos.toolCalls.insert({
      sessionId: "s1",
      callId: "dup",
      toolName: "task",
      agentType: "general",
      description: "run",
      agent: "build",
      modelId: "m",
      providerId: "p",
    })

    const db = new Database(dbPath, { readonly: true })
    const countRow = db.prepare("SELECT COUNT(*) AS count FROM tool_calls WHERE call_id = 'dup'").get() as { count: number }
    expect(countRow.count).toBe(1)
    db.close()

    const agentCalls = repos.toolCalls.getAgentCalls()
    expect(agentCalls.length).toBe(1)
    expect(agentCalls[0]?.agent_type).toBe("general")
    expect(agentCalls[0]?.call_count).toBe(1)

    const summary = repos.toolCalls.getToolUsageSummary()
    expect(summary.length).toBe(1)
    expect(summary[0]?.tools[0]?.tool_name).toBe("task")

    repos.close()
  })

  test("gcOldData removes old messages/tool calls and orphan sessions", () => {
    const { dir, dbPath } = createTempDbPath()
    cleanupDirs.push(dir)
    const repos = createSqliteRepos(dbPath)
    const db = new Database(dbPath)

    db.prepare("INSERT INTO sessions (session_id, first_seen, last_seen) VALUES (?, ?, ?)").run(
      "old-session",
      "2025-01-01 10:00:00",
      "2025-01-01 10:00:00",
    )
    db.prepare("INSERT INTO sessions (session_id, first_seen, last_seen) VALUES (?, ?, ?)").run(
      "new-session",
      "2026-05-01 10:00:00",
      "2026-05-01 10:00:00",
    )
    db.prepare("INSERT INTO messages (session_id, message_id, role, timestamp) VALUES ('old-session', 'old-msg', 'assistant', '2025-01-01 10:00:00')").run()
    db.prepare("INSERT INTO messages (session_id, message_id, role, timestamp) VALUES ('new-session', 'new-msg', 'assistant', '2026-05-01 10:00:00')").run()
    db.prepare("INSERT INTO tool_calls (session_id, call_id, tool_name, timestamp) VALUES ('old-session', 'old-call', 'bash', '2025-01-01 10:00:00')").run()
    db.prepare("INSERT INTO tool_calls (session_id, call_id, tool_name, timestamp) VALUES ('new-session', 'new-call', 'bash', '2026-05-01 10:00:00')").run()
    db.close()

    gcOldData(repos, 180)

    const check = new Database(dbPath, { readonly: true })
    const msgIds = check.prepare("SELECT message_id FROM messages ORDER BY message_id").all() as Array<{ message_id: string }>
    const callIds = check.prepare("SELECT call_id FROM tool_calls ORDER BY call_id").all() as Array<{ call_id: string }>
    const sessions = check.prepare("SELECT session_id FROM sessions ORDER BY session_id").all() as Array<{ session_id: string }>

    expect(msgIds.map((r) => r.message_id)).toEqual(["new-msg"])
    expect(callIds.map((r) => r.call_id)).toEqual(["new-call"])
    expect(sessions.map((r) => r.session_id)).toEqual(["new-session"])

    check.close()
    repos.close()
  })
})
