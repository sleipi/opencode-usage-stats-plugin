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

// --- Schema ---

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

// --- Helper: date strings relative to now ---

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function minutesAgo(n: number): string {
  const d = new Date();
  d.setTime(d.getTime() - n * 60_000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

const today = daysAgo(0);
const yesterday = daysAgo(1);
const threeDaysAgo = daysAgo(3);

// --- Sessions ---

// Session 1: active session (last seen ~2 min ago) in /tmp/e2e-project
db.prepare(`
  INSERT INTO sessions (session_id, title, directory, first_seen, last_seen)
  VALUES (?, ?, ?, ?, ?)
`).run(
  "session-e2e-1",
  "E2E Session",
  "/tmp/e2e-project",
  minutesAgo(30),
  minutesAgo(2),
);

// Session 2: old session (25 hours ago) in /tmp/e2e-other
db.prepare(`
  INSERT INTO sessions (session_id, title, directory, first_seen, last_seen)
  VALUES (?, ?, ?, ?, ?)
`).run(
  "session-e2e-2",
  "Other Session",
  "/tmp/e2e-other",
  minutesAgo(25 * 60),
  minutesAgo(25 * 60),
);

// Session 3: child/subagent of session-e2e-1 (should NOT appear as own card)
db.prepare(`
  INSERT INTO sessions (session_id, parent_id, title, directory, first_seen, last_seen)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(
  "session-e2e-child-1",
  "session-e2e-1",
  "@explore subagent",
  "/tmp/e2e-project",
  minutesAgo(20),
  minutesAgo(15),
);

// --- Messages ---

// Session 1: build message with gpt-5.3-codex
db.prepare(`
  INSERT INTO messages
    (timestamp, session_id, message_id, role, model_id, provider_id, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cost, agent)
  VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  minutesAgo(25),
  "session-e2e-1",
  "msg-e2e-1",
  "gpt-5.3-codex",
  "github-copilot",
  1200,
  300,
  100,
  600,
  0.25,
  "build",
);

// Session 1: plan message with claude-sonnet
db.prepare(`
  INSERT INTO messages
    (timestamp, session_id, message_id, role, model_id, provider_id, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cost, agent)
  VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  minutesAgo(20),
  "session-e2e-1",
  "msg-e2e-2",
  "claude-sonnet-4",
  "anthropic",
  800,
  200,
  50,
  400,
  0.15,
  "plan",
);

// Session 2: build message with claude-sonnet (different model for model chart)
db.prepare(`
  INSERT INTO messages
    (timestamp, session_id, message_id, role, model_id, provider_id, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cost, agent)
  VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  minutesAgo(25 * 60),
  "session-e2e-2",
  "msg-e2e-3",
  "claude-sonnet-4",
  "anthropic",
  500,
  150,
  0,
  200,
  0.1,
  "build",
);

// Child session message (subagent tokens)
db.prepare(`
  INSERT INTO messages
    (timestamp, session_id, message_id, role, model_id, provider_id, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cost, agent)
  VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  minutesAgo(18),
  "session-e2e-child-1",
  "msg-e2e-child-1",
  "claude-sonnet-4",
  "anthropic",
  400,
  100,
  0,
  200,
  0.05,
  "build",
);

// --- Tool Calls ---

// Session 1: bash tool call
db.prepare(`
  INSERT INTO tool_calls (timestamp, session_id, call_id, tool_name, agent_type, description, agent, model_id, provider_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  minutesAgo(24),
  "session-e2e-1",
  "call-e2e-1",
  "bash",
  "general",
  "Run command",
  "build",
  "gpt-5.3-codex",
  "github-copilot",
);

// Session 1: read tool call
db.prepare(`
  INSERT INTO tool_calls (timestamp, session_id, call_id, tool_name, agent_type, description, agent, model_id, provider_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  minutesAgo(22),
  "session-e2e-1",
  "call-e2e-2",
  "read",
  "explore",
  "Read file",
  "build",
  "claude-sonnet-4",
  "anthropic",
);

// Child session: tool call (explore subagent)
db.prepare(`
  INSERT INTO tool_calls (timestamp, session_id, call_id, tool_name, agent_type, description, agent, model_id, provider_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  minutesAgo(17),
  "session-e2e-child-1",
  "call-e2e-child-1",
  "grep",
  "explore",
  "Search files",
  "build",
  "claude-sonnet-4",
  "anthropic",
);

// --- Daily Usage (multiple days for charts) ---

const dailyData = [
  { day: today, tokens: 2500, sessions: 1, messages: 2, tools: 2 },
  { day: yesterday, tokens: 5000, sessions: 2, messages: 5, tools: 3 },
  { day: threeDaysAgo, tokens: 3200, sessions: 1, messages: 3, tools: 2 },
  { day: daysAgo(7), tokens: 8000, sessions: 3, messages: 8, tools: 6 },
  { day: daysAgo(14), tokens: 4500, sessions: 2, messages: 4, tools: 3 },
  { day: daysAgo(30), tokens: 6000, sessions: 2, messages: 6, tools: 4 },
  { day: daysAgo(45), tokens: 3000, sessions: 1, messages: 3, tools: 2 },
];

const insertDaily = db.prepare(`
  INSERT INTO daily_usage (day, tokens_total, sessions_count, messages_count, tool_calls_count)
  VALUES (?, ?, ?, ?, ?)
`);

for (const d of dailyData) {
  insertDaily.run(d.day, d.tokens, d.sessions, d.messages, d.tools);
}

db.close();
