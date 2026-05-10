import type { Database } from "bun:sqlite";

type Migration = (db: Database) => void;

export const MIGRATIONS: Migration[] = [
  (db) => {
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

    db.run(
      `CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_tool_calls_tool    ON tool_calls(tool_name)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_tool_calls_agent   ON tool_calls(agent_type)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_tool_calls_timestamp ON tool_calls(timestamp)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_messages_session   ON messages(session_id)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_messages_model     ON messages(model_id)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_sessions_parent    ON sessions(parent_id)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_sessions_first_seen ON sessions(first_seen)`,
    );
  },
];

export function getSchemaVersion(): number {
  return MIGRATIONS.length;
}

export function migrate(db: Database): void {
  const versionRow = db.prepare("PRAGMA user_version").get() as {
    user_version?: number;
  };
  const currentVersion = Number(versionRow?.user_version ?? 0);

  for (let i = currentVersion; i < MIGRATIONS.length; i++) {
    db.run("BEGIN IMMEDIATE");
    try {
      MIGRATIONS[i]?.(db);
      db.run(`PRAGMA user_version = ${i + 1}`);
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw new Error(`Migration v${i} to v${i + 1} failed: ${String(e)}`);
    }
  }
}
