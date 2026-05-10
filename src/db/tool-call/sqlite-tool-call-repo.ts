import type { Database } from "bun:sqlite";
import type {
  AgentCallRow,
  ToolCallData,
  ToolCallRepo,
  ToolCountSummary,
  ToolGroupSummary,
} from "./tool-call-repo";

export class SqliteToolCallRepo implements ToolCallRepo {
  private readonly insertToolCallStmt;

  constructor(private readonly db: Database) {
    this.insertToolCallStmt = this.db.prepare(`
      INSERT OR IGNORE INTO tool_calls (session_id, call_id, tool_name, agent_type, description, agent, model_id, provider_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
    const timeFilters = {
      today: "date(tc.timestamp) = date('now')",
      thisWeek: "tc.timestamp >= date('now', 'weekday 1', '-7 days')",
      thisMonth: "tc.timestamp >= date('now', 'start of month')",
      lastMonth:
        "tc.timestamp >= date('now', 'start of month', '-1 month') AND tc.timestamp < date('now', 'start of month')",
    };

    const groups = this.db
      .prepare(`
      SELECT DISTINCT
        COALESCE(tc.agent,
          (SELECT m.agent FROM messages m WHERE m.session_id = tc.session_id AND m.agent IS NOT NULL ORDER BY m.timestamp DESC LIMIT 1),
          '__none__') AS agent,
        COALESCE(tc.provider_id,
          (SELECT m.provider_id FROM messages m WHERE m.session_id = tc.session_id AND m.provider_id IS NOT NULL ORDER BY m.timestamp DESC LIMIT 1),
          '__none__') AS provider_id,
        COALESCE(tc.model_id,
          (SELECT m.model_id FROM messages m WHERE m.session_id = tc.session_id AND m.model_id IS NOT NULL ORDER BY m.timestamp DESC LIMIT 1),
          '__none__') AS model_id
      FROM tool_calls tc
      ORDER BY agent, provider_id, model_id
    `)
      .all() as { agent: string; provider_id: string; model_id: string }[];

    const results: ToolGroupSummary[] = [];

    for (const group of groups) {
      const agentVal = group.agent === "__none__" ? null : group.agent;
      const providerVal =
        group.provider_id === "__none__" ? null : group.provider_id;
      const modelVal = group.model_id === "__none__" ? null : group.model_id;

      const escapeSql = (v: string): string => v.replaceAll("'", "''");
      const agentFilter =
        agentVal === null
          ? "tc.agent IS NULL AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.session_id = tc.session_id AND m.agent IS NOT NULL)"
          : `COALESCE(tc.agent, (SELECT m.agent FROM messages m WHERE m.session_id = tc.session_id AND m.agent IS NOT NULL ORDER BY m.timestamp DESC LIMIT 1)) = '${escapeSql(agentVal)}'`;
      const providerFilter =
        providerVal === null
          ? "tc.provider_id IS NULL AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.session_id = tc.session_id AND m.provider_id IS NOT NULL)"
          : `COALESCE(tc.provider_id, (SELECT m.provider_id FROM messages m WHERE m.session_id = tc.session_id AND m.provider_id IS NOT NULL ORDER BY m.timestamp DESC LIMIT 1)) = '${escapeSql(providerVal)}'`;
      const modelFilter =
        modelVal === null
          ? "tc.model_id IS NULL AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.session_id = tc.session_id AND m.model_id IS NOT NULL)"
          : `COALESCE(tc.model_id, (SELECT m.model_id FROM messages m WHERE m.session_id = tc.session_id AND m.model_id IS NOT NULL ORDER BY m.timestamp DESC LIMIT 1)) = '${escapeSql(modelVal)}'`;

      const groupWhere = `${agentFilter} AND ${providerFilter} AND ${modelFilter}`;
      const toolRows: Record<string, ToolCountSummary> = {};

      for (const [period, timeWhere] of Object.entries(timeFilters)) {
        const rows = this.db
          .prepare(`
          SELECT tc.tool_name, COUNT(*) AS cnt
          FROM tool_calls tc
          WHERE ${groupWhere} AND ${timeWhere}
          GROUP BY tc.tool_name
        `)
          .all() as { tool_name: string; cnt: number }[];

        for (const row of rows) {
          if (!toolRows[row.tool_name]) {
            toolRows[row.tool_name] = {
              tool_name: row.tool_name,
              today: 0,
              thisWeek: 0,
              thisMonth: 0,
              lastMonth: 0,
            };
          }
          toolRows[row.tool_name]![
            period as keyof Omit<ToolCountSummary, "tool_name">
          ] = row.cnt;
        }
      }

      const tools = Object.values(toolRows).sort(
        (a, b) => b.thisMonth + b.lastMonth - (a.thisMonth + a.lastMonth),
      );
      const latestRow = this.db
        .prepare(`
        SELECT MAX(tc.timestamp) AS latest_timestamp
        FROM tool_calls tc
        WHERE ${groupWhere}
      `)
        .get() as { latest_timestamp: string | null };

      if (tools.length > 0) {
        results.push({
          agent: agentVal,
          provider_id: providerVal,
          model_id: modelVal,
          latest_timestamp: latestRow?.latest_timestamp ?? null,
          tools,
        });
      }
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
      .prepare("DELETE FROM tool_calls WHERE date(timestamp) < ?")
      .run(cutoffDate);
    return result.changes;
  }
}
