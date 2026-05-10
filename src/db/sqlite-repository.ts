import { Database } from "bun:sqlite"
import type {
  AgentCallRow,
  ChildSessionRow,
  DailyModelTokens,
  DailyTokens,
  MessageData,
  ModeRow,
  Repos,
  RootSessionRow,
  SessionFullData,
  SessionUpsertData,
  TokenSummary,
  ToolCallData,
  ToolCountSummary,
  ToolGroupSummary,
} from "./interfaces"
import { getSchemaVersion, migrate } from "./migrations"

function setupConnection(db: Database, readonly: boolean): void {
  db.run("PRAGMA busy_timeout = 3000")
  if (!readonly) {
    db.run("PRAGMA journal_mode = WAL")
    db.run("PRAGMA synchronous = NORMAL")
  }
}

function assertReadableVersion(db: Database): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version?: number }
  const currentVersion = Number(row?.user_version ?? 0)
  if (currentVersion > getSchemaVersion()) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported ${getSchemaVersion()}. Please update this plugin/dashboard version.`,
    )
  }
}

export function createSqliteRepos(dbPath: string, opts?: { readonly?: boolean }): Repos {
  const readonly = opts?.readonly === true
  const db = new Database(dbPath, readonly ? { readonly: true } : undefined)
  setupConnection(db, readonly)

  if (readonly) {
    assertReadableVersion(db)
  } else {
    migrate(db)
  }

  const insertToolCallStmt = db.prepare(`
    INSERT OR IGNORE INTO tool_calls (session_id, call_id, tool_name, agent_type, description, agent, model_id, provider_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const upsertSessionStmt = db.prepare(`
    INSERT INTO sessions (session_id, project_id, first_seen, last_seen)
    VALUES (?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(session_id) DO UPDATE SET last_seen = datetime('now')
  `)

  const upsertSessionFullStmt = db.prepare(`
    INSERT INTO sessions (session_id, project_id, parent_id, title, directory, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(session_id) DO UPDATE SET
      parent_id = COALESCE(excluded.parent_id, sessions.parent_id),
      title     = COALESCE(excluded.title, sessions.title),
      directory = COALESCE(excluded.directory, sessions.directory),
      last_seen = datetime('now')
  `)

  const upsertMessageStmt = db.prepare(`
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
  `)

  const repos: Repos = {
    sessions: {
      upsert(data: SessionUpsertData): void {
        upsertSessionStmt.run(data.sessionId, data.projectId)
      },

      upsertFull(data: SessionFullData): void {
        upsertSessionFullStmt.run(data.sessionId, data.projectId, data.parentId, data.title, data.directory)
      },

      getRootSessions(): RootSessionRow[] {
        return db.prepare(`
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
          WHERE s.parent_id IS NULL
          GROUP BY s.session_id
          ORDER BY s.last_seen DESC
        `).all() as RootSessionRow[]
      },

      getChildSessions(): ChildSessionRow[] {
        return db.prepare(`
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
        `).all() as ChildSessionRow[]
      },

      deleteOrphaned(cutoffDate: string): number {
        const result = db.prepare(`
          DELETE FROM sessions
          WHERE date(last_seen) < ?
            AND session_id NOT IN (
              SELECT DISTINCT session_id FROM messages
              UNION
              SELECT DISTINCT session_id FROM tool_calls
            )
        `).run(cutoffDate)
        return result.changes
      },
    },

    messages: {
      upsert(data: MessageData): void {
        upsertMessageStmt.run(
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
        )
      },

      getModeStats(): ModeRow[] {
        return db.prepare(`
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
        `).all() as ModeRow[]
      },

      getTokenSummary(): TokenSummary {
        const sum = (where: string): number => {
          const row = db.prepare(`
            SELECT COALESCE(SUM(input_tokens + cache_read_tokens + output_tokens + reasoning_tokens), 0) AS total
            FROM messages WHERE ${where}
          `).get() as { total?: number }
          return Number(row?.total ?? 0)
        }

        return {
          today: sum("date(timestamp) = date('now')"),
          thisWeek: sum("timestamp >= date('now', 'weekday 1', '-7 days')"),
          thisMonth: sum("timestamp >= date('now', 'start of month')"),
          lastMonth: sum("timestamp >= date('now', 'start of month', '-1 month') AND timestamp < date('now', 'start of month')"),
        }
      },

      getTodayTokens(today: string): DailyTokens {
        return db.prepare(`
          SELECT ? AS date,
                 COALESCE(SUM(input_tokens + cache_read_tokens + output_tokens + reasoning_tokens), 0) AS total
          FROM messages
          WHERE date(timestamp) = ?
        `).get(today, today) as DailyTokens
      },

      getDailyTokensByModel(): DailyModelTokens[] {
        return db.prepare(`
          SELECT date(timestamp) AS date,
                 COALESCE(provider_id, 'unknown') || ' / ' || COALESCE(model_id, 'unknown') AS model,
                 COALESCE(SUM(input_tokens + cache_read_tokens + output_tokens + reasoning_tokens), 0) AS total
          FROM messages
          WHERE timestamp >= date('now', '-60 days')
          GROUP BY date, model
          ORDER BY date ASC
        `).all() as DailyModelTokens[]
      },

      deleteOlderThan(cutoffDate: string): number {
        const result = db.prepare("DELETE FROM messages WHERE date(timestamp) < ?").run(cutoffDate)
        return result.changes
      },
    },

    toolCalls: {
      insert(data: ToolCallData): void {
        insertToolCallStmt.run(
          data.sessionId,
          data.callId,
          data.toolName,
          data.agentType,
          data.description,
          data.agent,
          data.modelId,
          data.providerId,
        )
      },

      getAgentCalls(): AgentCallRow[] {
        return db.prepare(`
          SELECT session_id, agent_type, COUNT(*) AS call_count
          FROM tool_calls
          WHERE agent_type IS NOT NULL
          GROUP BY session_id, agent_type
        `).all() as AgentCallRow[]
      },

      getToolUsageSummary(): ToolGroupSummary[] {
        const timeFilters = {
          today: "date(tc.timestamp) = date('now')",
          thisWeek: "tc.timestamp >= date('now', 'weekday 1', '-7 days')",
          thisMonth: "tc.timestamp >= date('now', 'start of month')",
          lastMonth: "tc.timestamp >= date('now', 'start of month', '-1 month') AND tc.timestamp < date('now', 'start of month')",
        }

        const groups = db.prepare(`
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
        `).all() as { agent: string; provider_id: string; model_id: string }[]

        const results: ToolGroupSummary[] = []

        for (const group of groups) {
          const agentVal = group.agent === "__none__" ? null : group.agent
          const providerVal = group.provider_id === "__none__" ? null : group.provider_id
          const modelVal = group.model_id === "__none__" ? null : group.model_id

          const escapeSql = (v: string): string => v.replaceAll("'", "''")
          const agentFilter = agentVal === null
            ? "tc.agent IS NULL AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.session_id = tc.session_id AND m.agent IS NOT NULL)"
            : `COALESCE(tc.agent, (SELECT m.agent FROM messages m WHERE m.session_id = tc.session_id AND m.agent IS NOT NULL ORDER BY m.timestamp DESC LIMIT 1)) = '${escapeSql(agentVal)}'`
          const providerFilter = providerVal === null
            ? "tc.provider_id IS NULL AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.session_id = tc.session_id AND m.provider_id IS NOT NULL)"
            : `COALESCE(tc.provider_id, (SELECT m.provider_id FROM messages m WHERE m.session_id = tc.session_id AND m.provider_id IS NOT NULL ORDER BY m.timestamp DESC LIMIT 1)) = '${escapeSql(providerVal)}'`
          const modelFilter = modelVal === null
            ? "tc.model_id IS NULL AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.session_id = tc.session_id AND m.model_id IS NOT NULL)"
            : `COALESCE(tc.model_id, (SELECT m.model_id FROM messages m WHERE m.session_id = tc.session_id AND m.model_id IS NOT NULL ORDER BY m.timestamp DESC LIMIT 1)) = '${escapeSql(modelVal)}'`

          const groupWhere = `${agentFilter} AND ${providerFilter} AND ${modelFilter}`
          const toolRows: Record<string, ToolCountSummary> = {}

          for (const [period, timeWhere] of Object.entries(timeFilters)) {
            const rows = db.prepare(`
              SELECT tc.tool_name, COUNT(*) AS cnt
              FROM tool_calls tc
              WHERE ${groupWhere} AND ${timeWhere}
              GROUP BY tc.tool_name
            `).all() as { tool_name: string; cnt: number }[]

            for (const row of rows) {
              if (!toolRows[row.tool_name]) {
                toolRows[row.tool_name] = {
                  tool_name: row.tool_name,
                  today: 0,
                  thisWeek: 0,
                  thisMonth: 0,
                  lastMonth: 0,
                }
              }
              toolRows[row.tool_name][period as keyof Omit<ToolCountSummary, "tool_name">] = row.cnt
            }
          }

          const tools = Object.values(toolRows).sort((a, b) => (b.thisMonth + b.lastMonth) - (a.thisMonth + a.lastMonth))
          const latestRow = db.prepare(`
            SELECT MAX(tc.timestamp) AS latest_timestamp
            FROM tool_calls tc
            WHERE ${groupWhere}
          `).get() as { latest_timestamp: string | null }

          if (tools.length > 0) {
            results.push({
              agent: agentVal,
              provider_id: providerVal,
              model_id: modelVal,
              latest_timestamp: latestRow?.latest_timestamp ?? null,
              tools,
            })
          }
        }

        results.sort((a, b) => {
          const latestA = a.latest_timestamp ? Date.parse(a.latest_timestamp) : 0
          const latestB = b.latest_timestamp ? Date.parse(b.latest_timestamp) : 0
          if (latestA !== latestB) return latestB - latestA
          const totalA = a.tools.reduce((s, t) => s + t.thisMonth + t.lastMonth, 0)
          const totalB = b.tools.reduce((s, t) => s + t.thisMonth + t.lastMonth, 0)
          return totalB - totalA
        })

        return results
      },

      deleteOlderThan(cutoffDate: string): number {
        const result = db.prepare("DELETE FROM tool_calls WHERE date(timestamp) < ?").run(cutoffDate)
        return result.changes
      },
    },

    dailyUsage: {
      recompute(fromDay: string, toDay: string): void {
        db.run("BEGIN IMMEDIATE")
        try {
          db.prepare("DELETE FROM daily_usage WHERE day >= ? AND day <= ?").run(fromDay, toDay)

          db.prepare(`
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
          `).run(fromDay, toDay, fromDay, toDay, fromDay, toDay, fromDay, toDay)

          db.run("COMMIT")
        } catch (e) {
          db.run("ROLLBACK")
          throw e
        }
      },

      getHistoryUntil(dayExclusive: string, lookbackDays: number): DailyTokens[] {
        return db.prepare(`
          SELECT day AS date, tokens_total AS total
          FROM daily_usage
          WHERE day < ?
            AND day >= date('now', ?)
          ORDER BY day ASC
        `).all(dayExclusive, `-${lookbackDays} days`) as DailyTokens[]
      },
    },

    vacuum(): void {
      db.run("VACUUM")
    },

    close(): void {
      db.close()
    },
  }

  return repos
}

export function gcOldData(repos: Repos, retentionDays = 90): { messages: number; toolCalls: number; sessions: number } {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const deletedMessages = repos.messages.deleteOlderThan(cutoffDate)
  const deletedToolCalls = repos.toolCalls.deleteOlderThan(cutoffDate)
  const deletedSessions = repos.sessions.deleteOrphaned(cutoffDate)
  repos.vacuum()
  return { messages: deletedMessages, toolCalls: deletedToolCalls, sessions: deletedSessions }
}
