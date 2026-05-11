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

db.close();
