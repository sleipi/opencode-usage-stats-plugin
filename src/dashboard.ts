#!/usr/bin/env bun
/**
 * OpenCode Usage Stats Dashboard
 * Run: bun run ~/.config/opencode/plugins/usage-stats-dashboard.ts
 * Open: http://localhost:3333
 */
import { Database } from "bun:sqlite"
import { join } from "path"

const DB_PATH = join(process.env.HOME || "~", ".config", "opencode", "usage-stats.db")
const PORT = 3333

interface SessionStats {
  session_id: string
  title: string | null
  directory: string | null
  first_seen: string
  last_seen: string
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  cost: number
  agents: AgentStats[]
}

interface AgentStats {
  agent_type: string
  call_count: number
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cache_read_tokens: number
  model_id: string | null
  provider_id: string | null
}

function getStats(): SessionStats[] {
  const db = new Database(DB_PATH, { readonly: true })
  db.run("PRAGMA busy_timeout = 3000")

  // Root sessions (no parent), newest first — own message tokens only
  const rootSessions = db.prepare(`
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
  `).all() as any[]

  // Child sessions with their token totals, linked to parent via parent_id
  const childSessions = db.prepare(`
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
  `).all() as any[]

  // Agent type per parent session from tool_calls
  const agentCalls = db.prepare(`
    SELECT session_id, agent_type, COUNT(*) AS call_count
    FROM tool_calls
    WHERE agent_type IS NOT NULL
    GROUP BY session_id, agent_type
  `).all() as any[]

  db.close()

  // Map: parent_id -> child sessions
  const childMap = new Map<string, any[]>()
  for (const c of childSessions) {
    if (!c.parent_id) continue
    if (!childMap.has(c.parent_id)) childMap.set(c.parent_id, [])
    childMap.get(c.parent_id)!.push(c)
  }

  // Map: parent_session_id -> { agent_type -> call_count }
  const agentMap = new Map<string, Map<string, number>>()
  for (const a of agentCalls) {
    if (!agentMap.has(a.session_id)) agentMap.set(a.session_id, new Map())
    agentMap.get(a.session_id)!.set(a.agent_type, a.call_count)
  }

  return rootSessions.map((s) => {
    const children = childMap.get(s.session_id) || []
    const agentCallCounts = agentMap.get(s.session_id) || new Map()

    // Build agent details from child sessions
    // Extract agent_type from child title pattern: "... (@agent-type subagent)"
    const agentDetails: AgentStats[] = []
    const seenAgents = new Map<string, AgentStats>()

    for (const child of children) {
      // Parse agent type from title like "PM says Ja (@product-manager subagent)"
      const match = child.title?.match(/@(\S+)\s+subagent/)
      const agentType = match?.[1] ?? "subagent"

      if (seenAgents.has(agentType)) {
        // Aggregate multiple calls of same agent type
        const existing = seenAgents.get(agentType)!
        existing.call_count += 1
        existing.input_tokens += child.input_tokens
        existing.output_tokens += child.output_tokens
        existing.reasoning_tokens += child.reasoning_tokens
        existing.cache_read_tokens += child.cache_read_tokens
      } else {
        const stats: AgentStats = {
          agent_type: agentType,
          call_count: 1,
          input_tokens: child.input_tokens,
          output_tokens: child.output_tokens,
          reasoning_tokens: child.reasoning_tokens,
          cache_read_tokens: child.cache_read_tokens,
          model_id: child.model_id,
          provider_id: child.provider_id,
        }
        seenAgents.set(agentType, stats)
        agentDetails.push(stats)
      }
    }

    // Override call_count from tool_calls if available (more accurate)
    for (const agent of agentDetails) {
      const count = agentCallCounts.get(agent.agent_type)
      if (count) agent.call_count = count
    }

    // Add agents from tool_calls that have no child sessions yet (no token data)
    for (const [agentType, count] of agentCallCounts) {
      if (!seenAgents.has(agentType)) {
        agentDetails.push({
          agent_type: agentType,
          call_count: count,
          input_tokens: 0,
          output_tokens: 0,
          reasoning_tokens: 0,
          cache_read_tokens: 0,
          model_id: null,
          provider_id: null,
        })
      }
    }

    // Total = own tokens + all child tokens
    const childIn = agentDetails.reduce((sum, a) => sum + a.input_tokens, 0)
    const childOut = agentDetails.reduce((sum, a) => sum + a.output_tokens, 0)
    const childReasoning = agentDetails.reduce((sum, a) => sum + a.reasoning_tokens, 0)
    const childCache = agentDetails.reduce((sum, a) => sum + a.cache_read_tokens, 0)

    return {
      session_id: s.session_id,
      title: s.title,
      directory: s.directory,
      first_seen: s.first_seen,
      last_seen: s.last_seen,
      input_tokens: s.input_tokens + childIn,
      output_tokens: s.output_tokens + childOut,
      reasoning_tokens: s.reasoning_tokens + childReasoning,
      cache_read_tokens: s.cache_read_tokens + childCache,
      cache_write_tokens: s.cache_write_tokens,
      cost: s.cost,
      agents: agentDetails,
    }
  })
}

interface TokenSummary {
  today: number
  thisWeek: number
  thisMonth: number
  lastMonth: number
}

function getTokenSummary(): TokenSummary {
  const db = new Database(DB_PATH, { readonly: true })
  db.run("PRAGMA busy_timeout = 3000")

  const sum = (where: string) => {
    const row = db.prepare(`
      SELECT COALESCE(SUM(input_tokens + cache_read_tokens + output_tokens + reasoning_tokens), 0) AS total
      FROM messages WHERE ${where}
    `).get() as any
    return row?.total ?? 0
  }

  const result = {
    today: sum("date(timestamp) = date('now')"),
    thisWeek: sum("timestamp >= date('now', 'weekday 1', '-7 days')"),
    thisMonth: sum("timestamp >= date('now', 'start of month')"),
    lastMonth: sum("timestamp >= date('now', 'start of month', '-1 month') AND timestamp < date('now', 'start of month')"),
  }

  db.close()
  return result
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE")
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function renderTokens(input: number, cache: number, output: number, reasoning: number): string {
  const totalIn = input + cache
  const cachePercent = totalIn > 0 ? Math.round((cache / totalIn) * 100) : 0
  const cacheInfo = cache > 0 ? ` <span class="token-cache">(${cachePercent}% cached)<span class="info-icon" title="Cache-Read-Tokens: Input-Tokens die der Provider aus seinem Prompt-Cache liest statt neu zu verarbeiten. In langen Konversationen bleibt der bisherige Kontext (System-Prompt, vorherige Nachrichten, Tool-Outputs) gecached. Das ist schneller und günstiger (bis zu 90% Rabatt bei Anthropic).">?</span></span>` : ""

  let html = `<span class="token-in">${fmt(totalIn)} in</span>${cacheInfo}`
  html += ` <span class="token-sep">/</span> <span class="token-out">${fmt(output)} out</span>`
  if (reasoning > 0) {
    html += ` <span class="token-sep">/</span> <span class="token-reasoning">${fmt(reasoning)} reasoning</span>`
  }
  return html
}

function renderSessionCard(s: SessionStats): string {
  const title = s.title || s.directory?.split("/").pop() || s.session_id
  const time = s.last_seen?.replace("T", " ").slice(0, 16) ?? ""

  const agentRows = s.agents.map((a) => {
    const agentTokens = renderTokens(a.input_tokens, a.cache_read_tokens, a.output_tokens, a.reasoning_tokens)
    const model = a.model_id ? `<span class="agent-model">${esc(a.model_id)}</span>` : ""
    return `
      <div class="agent-row">
        <span class="agent-badge">${esc(a.agent_type)}</span>
        <span class="agent-calls">${a.call_count}x</span>
        ${model}
        <span class="tokens-detail">${agentTokens}</span>
      </div>`
  }).join("")

  const sessionTokens = renderTokens(s.input_tokens, s.cache_read_tokens, s.output_tokens, s.reasoning_tokens)

  return `
    <div class="session-card">
      <div class="session-header">
        <div class="session-title">${esc(title)}</div>
        <div class="session-time">${time}</div>
      </div>
      <div class="session-id">${esc(s.session_id)}</div>
      <div class="session-tokens">
        <span class="token-label">Tokens:</span>
        ${sessionTokens}
      </div>
      ${agentRows ? `<div class="agents-section"><div class="agents-label">Agents</div>${agentRows}</div>` : ""}
    </div>`
}

function renderStatsBar(summary: TokenSummary): string {
  return `
    <div class="stats-bar">
      <div class="stats-item"><span class="stats-label">Today:</span> <span class="stats-value">${fmt(summary.today)}</span></div>
      <div class="stats-item"><span class="stats-label">This Week:</span> <span class="stats-value">${fmt(summary.thisWeek)}</span></div>
      <div class="stats-item"><span class="stats-label">This Month:</span> <span class="stats-value">${fmt(summary.thisMonth)}</span></div>
      <div class="stats-item"><span class="stats-label">Last Month:</span> <span class="stats-value">${fmt(summary.lastMonth)}</span></div>
    </div>`
}

function renderSessionsFragment(sessions: SessionStats[], summary: TokenSummary): string {
  const bar = renderStatsBar(summary)
  if (sessions.length === 0) return bar + '<div class="empty">No sessions recorded yet.</div>'
  return bar + sessions.map(renderSessionCard).join("")
}

function renderHTML(sessions: SessionStats[], summary: TokenSummary): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenCode Usage Stats</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "SF Mono", "Fira Code", "JetBrains Mono", monospace;
      background: #0d1117;
      color: #c9d1d9;
      padding: 24px;
      max-width: 900px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid #21262d;
    }
    .header h1 { font-size: 18px; font-weight: 600; color: #f0f6fc; }
    .refresh-badge {
      font-size: 12px; color: #484f58;
      display: flex; align-items: center; gap: 6px;
    }
    .refresh-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #238636;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    .session-card {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      transition: border-color 0.2s;
    }
    .session-card:hover { border-color: #388bfd; }
    .session-header {
      display: flex; justify-content: space-between;
      align-items: center; margin-bottom: 4px;
    }
    .session-title { font-size: 15px; font-weight: 600; color: #f0f6fc; }
    .session-time { font-size: 12px; color: #484f58; }
    .session-id {
      font-size: 11px; color: #484f58; margin-bottom: 8px;
      word-break: break-all;
    }
    .session-tokens {
      font-size: 13px;
      display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
    }
    .token-label { color: #8b949e; }
    .token-in { color: #58a6ff; }
    .token-out { color: #3fb950; }
    .token-reasoning { color: #d2a8ff; }
    .token-cache { color: #8b949e; font-size: 12px; }
    .info-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 14px; height: 14px; border-radius: 50%;
      border: 1px solid #30363d; font-size: 10px;
      color: #8b949e; cursor: help; margin-left: 3px;
      vertical-align: middle;
    }
    .info-icon:hover { border-color: #58a6ff; color: #58a6ff; }
    .token-sep { color: #30363d; }
    .agents-section {
      margin-top: 12px; padding-top: 10px;
      border-top: 1px solid #21262d;
    }
    .agents-label {
      font-size: 11px; color: #8b949e;
      text-transform: uppercase; letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .agent-row {
      display: flex; align-items: center; gap: 10px;
      padding: 4px 0 4px 12px; font-size: 13px;
      border-left: 2px solid #21262d; margin-bottom: 4px;
    }
    .agent-badge {
      background: #1f2937; border: 1px solid #30363d;
      border-radius: 4px; padding: 1px 8px;
      font-size: 12px; color: #79c0ff; white-space: nowrap;
    }
    .agent-calls { color: #8b949e; font-size: 12px; min-width: 24px; }
    .agent-model { color: #484f58; font-size: 11px; }
    .tokens-detail { color: #8b949e; font-size: 12px; margin-left: auto; }
    .tokens-detail .token-in { color: #58a6ff; }
    .tokens-detail .token-out { color: #3fb950; }
    .tokens-detail .token-reasoning { color: #d2a8ff; }
    .tokens-detail .token-cache { color: #6e7681; }
    .tokens-detail .token-sep { color: #30363d; }
    .empty {
      text-align: center; color: #484f58;
      padding: 48px; font-size: 14px;
    }
    .stats-bar {
      display: flex; gap: 32px; align-items: center;
      padding: 12px 0; margin-bottom: 24px;
      border-bottom: 1px solid #21262d;
      font-size: 13px;
    }
    .stats-item { display: flex; gap: 6px; align-items: center; }
    .stats-label { color: #8b949e; }
    .stats-value { color: #f0f6fc; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <h1>OpenCode Usage Stats</h1>
    <div class="refresh-badge">
      <div class="refresh-dot"></div>
      auto-refresh 5s
    </div>
  </div>
  <div id="sessions">
    ${renderSessionsFragment(sessions, summary)}
  </div>
  <script>
    async function refresh() {
      try {
        const res = await fetch("/api/stats");
        const html = await res.text();
        document.getElementById("sessions").innerHTML = html;
      } catch {}
    }
    setInterval(refresh, 5000);
  </script>
</body>
</html>`
}

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === "/api/stats") {
      try {
        return new Response(renderSessionsFragment(getStats(), getTokenSummary()), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
      } catch (e) {
        return new Response(`<div class="empty">DB error: ${e}</div>`, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
      }
    }

    try {
      return new Response(renderHTML(getStats(), getTokenSummary()), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    } catch (e) {
      return new Response(`DB error: ${e}`, { status: 500 })
    }
  },
})

console.log(`Dashboard running at http://localhost:${PORT}`)
