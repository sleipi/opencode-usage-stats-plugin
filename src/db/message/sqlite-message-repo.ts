import type { Database } from "bun:sqlite";
import type { DailyTokens } from "../shared-types";
import type {
  DailyModelTokens,
  MessageData,
  MessageRepo,
  ModeRow,
  TokenSummary,
} from "./message-repo";

export class SqliteMessageRepo implements MessageRepo {
  private readonly upsertMessageStmt;

  constructor(private readonly db: Database) {
    this.upsertMessageStmt = this.db.prepare(`
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
    `);
  }

  upsert(data: MessageData): void {
    this.upsertMessageStmt.run(
      data.sessionId,
      data.messageId,
      data.role,
      data.modelId,
      data.providerId,
      data.inputTokens,
      data.outputTokens,
      data.reasoningTokens,
      data.cacheReadTokens,
      data.cacheWriteTokens,
      data.cost,
      data.agent,
    );
  }

  getModeStats(): ModeRow[] {
    return this.db
      .prepare(`
      SELECT session_id, agent, model_id, provider_id,
             COUNT(*)                               AS message_count,
             COALESCE(SUM(input_tokens), 0)         AS input_tokens,
             COALESCE(SUM(output_tokens), 0)        AS output_tokens,
             COALESCE(SUM(reasoning_tokens), 0)     AS reasoning_tokens,
             COALESCE(SUM(cache_read_tokens), 0)    AS cache_read_tokens,
             COALESCE(SUM(cost), 0)                 AS cost
      FROM messages
      WHERE agent IS NOT NULL
      GROUP BY session_id, agent, model_id, provider_id
    `)
      .all() as ModeRow[];
  }

  getTokenSummary(): TokenSummary {
    const sum = (where: string): number => {
      const row = this.db
        .prepare(`
        SELECT COALESCE(SUM(input_tokens + cache_read_tokens + output_tokens + reasoning_tokens), 0) AS total
        FROM messages WHERE ${where}
      `)
        .get() as { total?: number };
      return Number(row?.total ?? 0);
    };

    return {
      today: sum("date(timestamp) = date('now')"),
      thisWeek: sum("timestamp >= date('now', 'weekday 1', '-7 days')"),
      thisMonth: sum("timestamp >= date('now', 'start of month')"),
      lastMonth: sum(
        "timestamp >= date('now', 'start of month', '-1 month') AND timestamp < date('now', 'start of month')",
      ),
    };
  }

  getTodayTokens(today: string): DailyTokens {
    return this.db
      .prepare(`
      SELECT ? AS date,
             COALESCE(SUM(input_tokens + cache_read_tokens + output_tokens + reasoning_tokens), 0) AS total
      FROM messages
      WHERE date(timestamp) = ?
    `)
      .get(today, today) as DailyTokens;
  }

  getDailyTokensByModel(): DailyModelTokens[] {
    return this.db
      .prepare(`
      SELECT date(timestamp) AS date,
             COALESCE(provider_id, 'unknown') || ' / ' || COALESCE(model_id, 'unknown') AS model,
             COALESCE(SUM(input_tokens + cache_read_tokens + output_tokens + reasoning_tokens), 0) AS total
      FROM messages
      WHERE timestamp >= date('now', '-60 days')
      GROUP BY date, model
      ORDER BY date ASC
    `)
      .all() as DailyModelTokens[];
  }

  deleteOlderThan(cutoffDate: string): number {
    const result = this.db
      .prepare("DELETE FROM messages WHERE date(timestamp) < ?")
      .run(cutoffDate);
    return result.changes;
  }
}
