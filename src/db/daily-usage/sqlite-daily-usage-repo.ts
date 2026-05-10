import type { Database } from "bun:sqlite";
import type { DailyTokens } from "../shared-types";
import type { DailyUsageRepo } from "./daily-usage-repo";

export class SqliteDailyUsageRepo implements DailyUsageRepo {
  constructor(private readonly db: Database) {}

  recompute(fromDay: string, toDay: string): void {
    this.db.run("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("DELETE FROM daily_usage WHERE day >= ? AND day <= ?")
        .run(fromDay, toDay);

      this.db
        .prepare(`
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
      `)
        .run(fromDay, toDay, fromDay, toDay, fromDay, toDay, fromDay, toDay);

      this.db.run("COMMIT");
    } catch (e) {
      this.db.run("ROLLBACK");
      throw e;
    }
  }

  getHistoryUntil(dayExclusive: string, lookbackDays: number): DailyTokens[] {
    return this.db
      .prepare(`
      SELECT day AS date, tokens_total AS total
      FROM daily_usage
      WHERE day < ?
        AND day >= date('now', ?)
      ORDER BY day ASC
    `)
      .all(dayExclusive, `-${lookbackDays} days`) as DailyTokens[];
  }
}
