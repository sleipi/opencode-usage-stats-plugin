import type { Database } from "bun:sqlite";
import type {
  AgentCallRow,
  ToolCallData,
  ToolCallRepo,
  ToolGroupSummary,
} from "./tool-call-repo";

export class SqliteToolCallRepo implements ToolCallRepo {
  private readonly insertToolCallStmt;
  private readonly toolUsageSummaryStmt;

  constructor(private readonly db: Database) {
    this.insertToolCallStmt = this.db.prepare(`
      INSERT OR IGNORE INTO tool_calls (session_id, call_id, tool_name, agent_type, description, agent, model_id, provider_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.toolUsageSummaryStmt = this.db.prepare(`
      WITH resolved AS (
        SELECT
          tc.tool_name,
          tc.timestamp,
          COALESCE(tc.agent,
            (SELECT m.agent FROM messages m
             WHERE m.session_id = tc.session_id AND m.agent IS NOT NULL
             ORDER BY m.timestamp DESC LIMIT 1)) AS agent,
          COALESCE(tc.provider_id,
            (SELECT m.provider_id FROM messages m
             WHERE m.session_id = tc.session_id AND m.provider_id IS NOT NULL
             ORDER BY m.timestamp DESC LIMIT 1)) AS provider_id,
          COALESCE(tc.model_id,
            (SELECT m.model_id FROM messages m
             WHERE m.session_id = tc.session_id AND m.model_id IS NOT NULL
             ORDER BY m.timestamp DESC LIMIT 1)) AS model_id
        FROM tool_calls tc
      )
      SELECT
        agent,
        provider_id,
        model_id,
        tool_name,
        MAX(timestamp) AS latest_timestamp,
        SUM(CASE WHEN timestamp >= date('now') AND timestamp < date('now', '+1 day') THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN timestamp >= date('now', 'weekday 1', '-7 days') THEN 1 ELSE 0 END) AS this_week,
        SUM(CASE WHEN timestamp >= date('now', 'start of month') THEN 1 ELSE 0 END) AS this_month,
        SUM(CASE WHEN timestamp >= date('now', 'start of month', '-1 month')
                  AND timestamp < date('now', 'start of month') THEN 1 ELSE 0 END) AS last_month
      FROM resolved
      GROUP BY agent, provider_id, model_id, tool_name
      ORDER BY agent, provider_id, model_id
    `);
  }

  insert(data: ToolCallData): void {
    this.insertToolCallStmt.run(
      data.sessionId,
      data.callId,
      data.toolName,
      data.agentType,
      data.description,
      data.agent,
      data.modelId,
      data.providerId,
    );
  }

  getAgentCalls(): AgentCallRow[] {
    return this.db
      .prepare(`
      SELECT session_id, agent_type, COUNT(*) AS call_count
      FROM tool_calls
      WHERE agent_type IS NOT NULL
      GROUP BY session_id, agent_type
    `)
      .all() as AgentCallRow[];
  }

  getToolUsageSummary(): ToolGroupSummary[] {
    interface FlatRow {
      agent: string | null;
      provider_id: string | null;
      model_id: string | null;
      tool_name: string;
      latest_timestamp: string | null;
      today: number;
      this_week: number;
      this_month: number;
      last_month: number;
    }

    const rows = this.toolUsageSummaryStmt.all() as FlatRow[];

    const groupMap = new Map<string, ToolGroupSummary>();

    for (const row of rows) {
      const key = `${row.agent ?? "__none__"}|${row.provider_id ?? "__none__"}|${row.model_id ?? "__none__"}`;
      let group = groupMap.get(key);
      if (!group) {
        group = {
          agent: row.agent ?? null,
          provider_id: row.provider_id ?? null,
          model_id: row.model_id ?? null,
          latest_timestamp: row.latest_timestamp ?? null,
          tools: [],
        };
        groupMap.set(key, group);
      }

      if (
        row.latest_timestamp &&
        (!group.latest_timestamp ||
          row.latest_timestamp > group.latest_timestamp)
      ) {
        group.latest_timestamp = row.latest_timestamp;
      }

      group.tools.push({
        tool_name: row.tool_name,
        today: row.today,
        thisWeek: row.this_week,
        thisMonth: row.this_month,
        lastMonth: row.last_month,
      });
    }

    const results = Array.from(groupMap.values());

    for (const group of results) {
      group.tools.sort(
        (a, b) => b.thisMonth + b.lastMonth - (a.thisMonth + a.lastMonth),
      );
    }

    results.sort((a, b) => {
      const latestA = a.latest_timestamp ? Date.parse(a.latest_timestamp) : 0;
      const latestB = b.latest_timestamp ? Date.parse(b.latest_timestamp) : 0;
      if (latestA !== latestB) return latestB - latestA;
      const totalA = a.tools.reduce((s, t) => s + t.thisMonth + t.lastMonth, 0);
      const totalB = b.tools.reduce((s, t) => s + t.thisMonth + t.lastMonth, 0);
      return totalB - totalA;
    });

    return results;
  }

  deleteOlderThan(cutoffDate: string): number {
    const result = this.db
      .prepare("DELETE FROM tool_calls WHERE timestamp < ?")
      .run(cutoffDate);
    return result.changes;
  }
}
