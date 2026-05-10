import type { Plugin } from "@opencode-ai/plugin"
import { Database } from "bun:sqlite"
import { join } from "path"

const DB_PATH = join(process.env.HOME || "~", ".config", "opencode", "usage-stats.db")

export function initDB(): Database {
  const db = new Database(DB_PATH)
  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA busy_timeout = 5000")

  db.run(`
    CREATE TABLE IF NOT EXISTS tool_calls (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT    NOT NULL DEFAULT (datetime('now')),
      session_id  TEXT    NOT NULL,
      call_id     TEXT    NOT NULL UNIQUE,
      tool_name   TEXT    NOT NULL,
      agent_type  TEXT,
      description TEXT,
      duration_ms INTEGER
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp     TEXT    NOT NULL DEFAULT (datetime('now')),
      session_id    TEXT    NOT NULL,
      message_id    TEXT    NOT NULL,
      role          TEXT    NOT NULL,
      model_id      TEXT,
      provider_id   TEXT,
      input_tokens  INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      reasoning_tokens INTEGER DEFAULT 0,
      cache_read_tokens  INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      cost          REAL    DEFAULT 0,
      UNIQUE(session_id, message_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id  TEXT PRIMARY KEY,
      project_id  TEXT,
      parent_id   TEXT,
      title       TEXT,
      directory   TEXT,
      first_seen  TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Migrate: add columns if they don't exist (safe for existing DBs)
  for (const col of ["parent_id TEXT", "title TEXT", "directory TEXT"]) {
    try { db.run(`ALTER TABLE sessions ADD COLUMN ${col}`) } catch { /* already exists */ }
  }

  // Migrate: add agent column to messages
  try { db.run(`ALTER TABLE messages ADD COLUMN agent TEXT`) } catch { /* already exists */ }

  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_calls_tool    ON tool_calls(tool_name)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_calls_agent   ON tool_calls(agent_type)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_session   ON messages(session_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_model     ON messages(model_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_parent    ON sessions(parent_id)`)

  // Performance indexes for time-based queries
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_first_seen ON sessions(first_seen)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_calls_timestamp ON tool_calls(timestamp)`)

  // Daily usage aggregation table
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_usage (
      day               TEXT PRIMARY KEY,
      tokens_total      INTEGER NOT NULL DEFAULT 0,
      cost_total        REAL    NOT NULL DEFAULT 0,
      sessions_count    INTEGER NOT NULL DEFAULT 0,
      messages_count    INTEGER NOT NULL DEFAULT 0,
      tool_calls_count  INTEGER NOT NULL DEFAULT 0,
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  return db
}

/**
 * Recompute daily_usage aggregations for a given date range.
 * @param db Database instance
 * @param fromDay YYYY-MM-DD (inclusive)
 * @param toDay YYYY-MM-DD (inclusive)
 */
export function recomputeDailyUsage(db: Database, fromDay: string, toDay: string): void {
  try {
    db.run("BEGIN IMMEDIATE")

    // Delete existing entries in the range
    db.prepare("DELETE FROM daily_usage WHERE day >= ? AND day <= ?").run(fromDay, toDay)

    // Recompute and insert
    db.prepare(`
      INSERT INTO daily_usage (day, tokens_total, cost_total, sessions_count, messages_count, tool_calls_count, updated_at)
      WITH RECURSIVE days(day) AS (
        SELECT ?
        UNION ALL
        SELECT date(day, '+1 day') FROM days WHERE day < ?
      ),
      m AS (
        SELECT date(timestamp) AS day,
               SUM(input_tokens + cache_read_tokens + output_tokens + reasoning_tokens) AS tokens_total,
               SUM(cost) AS cost_total,
               COUNT(*) AS messages_count
        FROM messages
        WHERE date(timestamp) >= ? AND date(timestamp) <= ?
        GROUP BY date(timestamp)
      ),
      s AS (
        SELECT date(first_seen) AS day,
               COUNT(*) AS sessions_count
        FROM sessions
        WHERE date(first_seen) >= ? AND date(first_seen) <= ?
        GROUP BY date(first_seen)
      ),
      t AS (
        SELECT date(timestamp) AS day,
               COUNT(*) AS tool_calls_count
        FROM tool_calls
        WHERE date(timestamp) >= ? AND date(timestamp) <= ?
        GROUP BY date(timestamp)
      )
      SELECT
        d.day,
        COALESCE(m.tokens_total, 0),
        COALESCE(m.cost_total, 0),
        COALESCE(s.sessions_count, 0),
        COALESCE(m.messages_count, 0),
        COALESCE(t.tool_calls_count, 0),
        datetime('now')
      FROM days d
      LEFT JOIN m ON m.day = d.day
      LEFT JOIN s ON s.day = d.day
      LEFT JOIN t ON t.day = d.day
      ORDER BY d.day
    `).run(fromDay, toDay, fromDay, toDay, fromDay, toDay, fromDay, toDay)

    db.run("COMMIT")
  } catch (e) {
    db.run("ROLLBACK")
    console.error("recomputeDailyUsage failed:", e)
  }
}

/**
 * Garbage collect raw data older than 90 days.
 * Deletes messages, tool_calls, and orphaned sessions.
 * @param db Database instance
 * @param retentionDays Number of days to keep (default: 90)
 */
export function gcOldData(db: Database, retentionDays = 90): void {
  try {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    
    db.run("BEGIN IMMEDIATE")

    // Delete old messages
    const deletedMessages = db.prepare(`
      DELETE FROM messages WHERE date(timestamp) < ?
    `).run(cutoffDate)

    // Delete old tool_calls
    const deletedToolCalls = db.prepare(`
      DELETE FROM tool_calls WHERE date(timestamp) < ?
    `).run(cutoffDate)

    // Delete orphaned sessions (no messages, no tool_calls, older than cutoff)
    const deletedSessions = db.prepare(`
      DELETE FROM sessions
      WHERE date(last_seen) < ?
        AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.session_id = sessions.session_id)
        AND NOT EXISTS (SELECT 1 FROM tool_calls WHERE tool_calls.session_id = sessions.session_id)
    `).run(cutoffDate)

    db.run("COMMIT")

    console.log(`GC: deleted ${deletedMessages.changes} messages, ${deletedToolCalls.changes} tool_calls, ${deletedSessions.changes} sessions older than ${cutoffDate}`)
  } catch (e) {
    db.run("ROLLBACK")
    console.error("gcOldData failed:", e)
  }
}

export const UsageStatsPlugin: Plugin = async (ctx) => {
  const db = initDB()

  // Initial aggregation: last 7 days
  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  recomputeDailyUsage(db, sevenDaysAgo, today)

  // Garbage collect old data (>90 days)
  gcOldData(db, 90)

  const insertCall = db.prepare(`
    INSERT OR IGNORE INTO tool_calls (session_id, call_id, tool_name, agent_type, description)
    VALUES (?, ?, ?, ?, ?)
  `)

  const upsertSession = db.prepare(`
    INSERT INTO sessions (session_id, project_id, first_seen, last_seen)
    VALUES (?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(session_id) DO UPDATE SET last_seen = datetime('now')
  `)

  const upsertSessionFull = db.prepare(`
    INSERT INTO sessions (session_id, project_id, parent_id, title, directory, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(session_id) DO UPDATE SET
      parent_id = COALESCE(excluded.parent_id, sessions.parent_id),
      title     = COALESCE(excluded.title, sessions.title),
      directory = COALESCE(excluded.directory, sessions.directory),
      last_seen = datetime('now')
  `)

  const upsertMessage = db.prepare(`
    INSERT INTO messages (session_id, message_id, role, model_id, provider_id,
                          input_tokens, output_tokens, reasoning_tokens,
                          cache_read_tokens, cache_write_tokens, cost, agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, message_id) DO UPDATE SET
      model_id = excluded.model_id,
      provider_id = excluded.provider_id,
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      reasoning_tokens = excluded.reasoning_tokens,
      cache_read_tokens = excluded.cache_read_tokens,
      cache_write_tokens = excluded.cache_write_tokens,
      cost = excluded.cost,
      agent = COALESCE(excluded.agent, messages.agent)
  `)

  const projectId = ctx.project?.id ?? null

  // Track the current agent mode per session (e.g. "plan", "build")
  const sessionAgentMap = new Map<string, string>()

  return {
    "chat.params": async (input, _output) => {
      // Track the agent mode (e.g. "plan", "build") for this session
      if (input.agent) {
        sessionAgentMap.set(input.sessionID, input.agent)
      }
    },

    "tool.execute.after": async (input, _output) => {
      const args = input.args as Record<string, unknown> | undefined

      const agentType = input.tool === "task" && args?.subagent_type
        ? String(args.subagent_type)
        : null

      const description = args?.description ? String(args.description) : null

      try {
        upsertSession.run(input.sessionID, projectId)
        insertCall.run(input.sessionID, input.callID, input.tool, agentType, description)
      } catch { /* ignore */ }
    },

    event: async ({ event }) => {
      try {
        // Debug: log all events to inspect for Plan/Build mode info
        // debugLog(event.type, (event as any).properties)

        // Track session metadata (title, directory, parentID)
        if (event.type === "session.created" || event.type === "session.updated") {
          const session = (event as any).properties?.info
          if (session?.id) {
            upsertSessionFull.run(
              session.id,
              session.projectID ?? projectId,
              session.parentID ?? null,
              session.title ?? null,
              session.directory ?? null,
            )
          }
          return
        }

        // Track model, tokens, cost from assistant messages
        if (event.type === "message.updated") {
          const msg = (event as any).properties?.info
          if (!msg || msg.role !== "assistant") return

          upsertSession.run(msg.sessionID, projectId)
          const agent = sessionAgentMap.get(msg.sessionID) ?? null
          upsertMessage.run(
            msg.sessionID,
            msg.id,
            msg.role,
            msg.modelID ?? null,
            msg.providerID ?? null,
            msg.tokens?.input ?? 0,
            msg.tokens?.output ?? 0,
            msg.tokens?.reasoning ?? 0,
            msg.tokens?.cache?.read ?? 0,
            msg.tokens?.cache?.write ?? 0,
            msg.cost ?? 0,
            agent,
          )
        }
      } catch { /* ignore */ }
    },
  }
}
