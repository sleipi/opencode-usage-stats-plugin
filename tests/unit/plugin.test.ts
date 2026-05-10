import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

function createTempDb() {
  const dir = mkdtempSync(join(tmpdir(), "opencode-usage-stats-unit-"))
  const dbPath = join(dir, "usage-stats.db")
  process.env.OPENCODE_USAGE_STATS_DB = dbPath
  return { dir, dbPath }
}

function cleanupTempDb(dir: string) {
  delete process.env.OPENCODE_USAGE_STATS_DB
  rmSync(dir, { recursive: true, force: true })
}

describe("plugin database utilities", () => {
  const { dir, dbPath } = createTempDb()
  let mod: typeof import("../../src/plugin")

  beforeAll(async () => {
    mod = await import("../../src/plugin")
  })

  beforeEach(() => {
    const db = mod.initDB()
    db.run("DELETE FROM daily_usage")
    db.run("DELETE FROM messages")
    db.run("DELETE FROM tool_calls")
    db.run("DELETE FROM sessions")
    db.close()
  })

  afterAll(() => {
    cleanupTempDb(dir)
  })

  test("initDB creates required tables", async () => {
    const db = mod.initDB()

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    const tableNames = new Set(tables.map((t) => t.name))

    expect(tableNames.has("sessions")).toBe(true)
    expect(tableNames.has("messages")).toBe(true)
    expect(tableNames.has("tool_calls")).toBe(true)
    expect(tableNames.has("daily_usage")).toBe(true)

    db.close()
  })

  test("recomputeDailyUsage aggregates day data", async () => {
    const db = mod.initDB()

    db.prepare("INSERT INTO sessions (session_id, first_seen, last_seen) VALUES (?, ?, ?)").run(
      "sess-1",
      "2026-05-01 10:00:00",
      "2026-05-01 11:00:00",
    )
    db.prepare("INSERT INTO sessions (session_id, first_seen, last_seen) VALUES (?, ?, ?)").run(
      "sess-2",
      "2026-05-02 10:00:00",
      "2026-05-02 11:00:00",
    )

    db.prepare(`
      INSERT INTO messages (session_id, message_id, role, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cost, timestamp)
      VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)
    `).run("sess-1", "msg-1", 100, 50, 10, 20, 0.1234, "2026-05-01 12:00:00")

    db.prepare("INSERT INTO tool_calls (session_id, call_id, tool_name, timestamp) VALUES (?, ?, ?, ?)").run(
      "sess-1",
      "call-1",
      "bash",
      "2026-05-01 12:00:00",
    )

    mod.recomputeDailyUsage(db, "2026-05-01", "2026-05-02")
    db.close()

    const checkDb = new Database(dbPath, { readonly: true })
    const rows = checkDb.prepare(`
      SELECT day, tokens_total, cost_total, sessions_count, messages_count, tool_calls_count
      FROM daily_usage
      ORDER BY day
    `).all() as Array<{
      day: string
      tokens_total: number
      cost_total: number
      sessions_count: number
      messages_count: number
      tool_calls_count: number
    }>

    expect(rows.length).toBe(2)
    expect(rows[0]?.day).toBe("2026-05-01")
    expect(rows[0]?.tokens_total).toBe(180)
    expect(rows[0]?.sessions_count).toBe(1)
    expect(rows[0]?.messages_count).toBe(1)
    expect(rows[0]?.tool_calls_count).toBe(1)
    expect(rows[1]?.day).toBe("2026-05-02")
    expect(rows[1]?.tokens_total).toBe(0)
    expect(rows[1]?.sessions_count).toBe(1)

    checkDb.close()
  })

  test("gcOldData removes old rows and keeps recent data", async () => {
    const db = mod.initDB()

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

    db.prepare(`
      INSERT INTO messages (session_id, message_id, role, input_tokens, output_tokens, timestamp)
      VALUES (?, ?, 'assistant', ?, ?, ?)
    `).run("old-session", "old-msg", 1, 1, "2025-01-01 10:00:00")

    db.prepare(`
      INSERT INTO messages (session_id, message_id, role, input_tokens, output_tokens, timestamp)
      VALUES (?, ?, 'assistant', ?, ?, ?)
    `).run("new-session", "new-msg", 2, 2, "2026-05-01 10:00:00")

    db.prepare("INSERT INTO tool_calls (session_id, call_id, tool_name, timestamp) VALUES (?, ?, ?, ?)").run(
      "old-session",
      "old-call",
      "bash",
      "2025-01-01 10:00:00",
    )
    db.prepare("INSERT INTO tool_calls (session_id, call_id, tool_name, timestamp) VALUES (?, ?, ?, ?)").run(
      "new-session",
      "new-call",
      "bash",
      "2026-05-01 10:00:00",
    )

    mod.gcOldData(db, 180)
    db.close()

    const checkDb = new Database(dbPath, { readonly: true })
    const msgIds = checkDb.prepare("SELECT message_id FROM messages ORDER BY message_id").all() as Array<{ message_id: string }>
    const callIds = checkDb.prepare("SELECT call_id FROM tool_calls ORDER BY call_id").all() as Array<{ call_id: string }>
    const sessions = checkDb.prepare("SELECT session_id FROM sessions ORDER BY session_id").all() as Array<{ session_id: string }>

    expect(msgIds.map((r) => r.message_id)).toEqual(["new-msg"])
    expect(callIds.map((r) => r.call_id)).toEqual(["new-call"])
    expect(sessions.map((r) => r.session_id)).toEqual(["new-session"])

    checkDb.close()
  })
})
