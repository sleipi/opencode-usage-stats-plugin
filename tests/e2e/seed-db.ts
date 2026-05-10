import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const dbPath = process.env.OPENCODE_USAGE_STATS_DB;

if (!dbPath) {
  throw new Error("OPENCODE_USAGE_STATS_DB is required");
}

mkdirSync(dirname(dbPath), { recursive: true });
rmSync(dbPath, { force: true });

const db = new Database(dbPath);

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
`);

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
    agent         TEXT,
    UNIQUE(session_id, message_id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS tool_calls (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT    NOT NULL DEFAULT (datetime('now')),
    session_id  TEXT    NOT NULL,
    call_id     TEXT    NOT NULL UNIQUE,
    tool_name   TEXT    NOT NULL,
    agent_type  TEXT,
    description TEXT,
    duration_ms INTEGER,
    agent       TEXT,
    model_id    TEXT,
    provider_id TEXT
  )
`);

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
`);

db.prepare(`
  INSERT INTO sessions (session_id, title, directory, first_seen, last_seen)
  VALUES (?, ?, ?, ?, ?)
`).run(
  "session-e2e-1",
  "E2E Session",
  "/tmp/e2e-project",
  "2026-05-10 10:00:00",
  "2026-05-10 10:10:00",
);

db.prepare(`
  INSERT INTO messages
    (timestamp, session_id, message_id, role, model_id, provider_id, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cost, agent)
  VALUES
    (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "2026-05-10 10:05:00",
  "session-e2e-1",
  "message-e2e-1",
  "gpt-5.3-codex",
  "github-copilot",
  1200,
  300,
  100,
  600,
  0.25,
  "build",
);

db.prepare(`
  INSERT INTO tool_calls (timestamp, session_id, call_id, tool_name, agent_type, description, agent, model_id, provider_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "2026-05-10 10:06:00",
  "session-e2e-1",
  "call-e2e-1",
  "bash",
  "general",
  "Run command",
  "build",
  "gpt-5.3-codex",
  "github-copilot",
);

db.prepare(`
  INSERT INTO daily_usage (day, tokens_total, sessions_count, messages_count, tool_calls_count)
  VALUES (?, ?, ?, ?, ?)
`).run("2026-05-10", 2200, 1, 1, 1);

db.close();
