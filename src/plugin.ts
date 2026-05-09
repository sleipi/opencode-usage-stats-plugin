import type { Plugin } from "@opencode-ai/plugin"
import { Database } from "bun:sqlite"
import { join } from "path"

const DB_PATH = join(process.env.HOME || "~", ".config", "opencode", "usage-stats.db")

function initDB(): Database {
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

  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_calls_tool    ON tool_calls(tool_name)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_calls_agent   ON tool_calls(agent_type)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_session   ON messages(session_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_model     ON messages(model_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_parent    ON sessions(parent_id)`)

  return db
}

export const UsageStatsPlugin: Plugin = async (ctx) => {
  const db = initDB()

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
                          cache_read_tokens, cache_write_tokens, cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, message_id) DO UPDATE SET
      model_id = excluded.model_id,
      provider_id = excluded.provider_id,
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      reasoning_tokens = excluded.reasoning_tokens,
      cache_read_tokens = excluded.cache_read_tokens,
      cache_write_tokens = excluded.cache_write_tokens,
      cost = excluded.cost
  `)

  const projectId = ctx.project?.id ?? null

  return {
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
          )
        }
      } catch { /* ignore */ }
    },
  }
}
