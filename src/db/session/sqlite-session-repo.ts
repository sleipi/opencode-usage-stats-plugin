import type { Database } from "bun:sqlite";
import type {
  ChildSessionRow,
  RootSessionRow,
  SessionFullData,
  SessionRepo,
  SessionUpsertData,
} from "./session-repo";

export class SqliteSessionRepo implements SessionRepo {
  private readonly upsertSessionStmt;
  private readonly upsertSessionFullStmt;

  constructor(private readonly db: Database) {
    this.upsertSessionStmt = this.db.prepare(`
      INSERT INTO sessions (session_id, project_id, first_seen, last_seen)
      VALUES (?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(session_id) DO UPDATE SET last_seen = datetime('now')
    `);

    this.upsertSessionFullStmt = this.db.prepare(`
      INSERT INTO sessions (session_id, project_id, parent_id, title, directory, first_seen, last_seen)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(session_id) DO UPDATE SET
        parent_id = COALESCE(excluded.parent_id, sessions.parent_id),
        title     = COALESCE(excluded.title, sessions.title),
        directory = COALESCE(excluded.directory, sessions.directory),
        last_seen = datetime('now')
    `);
  }

  upsert(data: SessionUpsertData): void {
    this.upsertSessionStmt.run(data.sessionId, data.projectId);
  }

  upsertFull(data: SessionFullData): void {
    this.upsertSessionFullStmt.run(
      data.sessionId,
      data.projectId,
      data.parentId,
      data.title,
      data.directory,
    );
  }

  getRootSessions(directory?: string): RootSessionRow[] {
    const baseQuery = `
      SELECT
        s.session_id, s.title, s.directory, s.first_seen, s.last_seen,
        COALESCE(SUM(m.input_tokens), 0)       AS input_tokens,
        COALESCE(SUM(m.output_tokens), 0)      AS output_tokens,
        COALESCE(SUM(m.reasoning_tokens), 0)   AS reasoning_tokens,
        COALESCE(SUM(m.cache_read_tokens), 0)  AS cache_read_tokens,
        COALESCE(SUM(m.cache_write_tokens), 0) AS cache_write_tokens,
        COALESCE(SUM(m.cost), 0)               AS cost
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.session_id
      WHERE s.parent_id IS NULL`;

    if (directory) {
      return this.db
        .prepare(`${baseQuery} AND s.directory = ? GROUP BY s.session_id ORDER BY s.last_seen DESC`)
        .all(directory) as RootSessionRow[];
    }

    return this.db
      .prepare(`${baseQuery} GROUP BY s.session_id ORDER BY s.last_seen DESC`)
      .all() as RootSessionRow[];
  }

  getDistinctDirectories(): string[] {
    return this.db
      .prepare(`SELECT DISTINCT directory FROM sessions WHERE directory IS NOT NULL ORDER BY directory`)
      .all()
      .map((row: any) => row.directory as string);
  }

  getChildSessions(): ChildSessionRow[] {
    return this.db
      .prepare(`
      SELECT
        s.session_id, s.parent_id, s.title,
        COALESCE(SUM(m.input_tokens), 0)       AS input_tokens,
        COALESCE(SUM(m.output_tokens), 0)      AS output_tokens,
        COALESCE(SUM(m.reasoning_tokens), 0)   AS reasoning_tokens,
        COALESCE(SUM(m.cache_read_tokens), 0)  AS cache_read_tokens,
        m.model_id, m.provider_id
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.session_id
      WHERE s.parent_id IS NOT NULL
      GROUP BY s.session_id
    `)
      .all() as ChildSessionRow[];
  }

  deleteOrphaned(cutoffDate: string): number {
    const result = this.db
      .prepare(`
      DELETE FROM sessions
      WHERE date(last_seen) < ?
        AND session_id NOT IN (
          SELECT DISTINCT session_id FROM messages
          UNION
          SELECT DISTINCT session_id FROM tool_calls
        )
    `)
      .run(cutoffDate);
    return result.changes;
  }
}
