#!/usr/bin/env bun
/**
 * OpenCode Usage Stats Dashboard
 * Run: bun run ~/.config/opencode/plugins/usage-stats-dashboard.ts
 * Open: http://localhost:3333
 */
import { join } from "node:path";
import type { DailyModelTokens, TokenSummary } from "./db/message/message-repo";
import type { Repos } from "./db/repos";
import type { DailyTokens } from "./db/shared-types";
import { createSqliteRepos, gcOldData } from "./db/sqlite-repository";
import type { ToolGroupSummary } from "./db/tool-call/tool-call-repo";

const DB_PATH =
  process.env.OPENCODE_USAGE_STATS_DB ||
  join(process.env.HOME || "~", ".config", "opencode", "usage-stats.db");
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3333;

// Track last aggregation time to avoid running too often
let lastAggregation = 0;
const MIN_AGGREGATION_INTERVAL_MS = 60_000; // 60 seconds

// Track last GC time
let lastGC = 0;
const MIN_GC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SessionStats {
  session_id: string;
  title: string | null;
  directory: string | null;
  first_seen: string;
  last_seen: string;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost: number;
  agents: AgentStats[];
  modes: ModeStats[];
}

interface AgentStats {
  agent_type: string;
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  model_id: string | null;
  provider_id: string | null;
}

interface ModeStats {
  agent: string;
  message_count: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  cost: number;
  model_id: string | null;
  provider_id: string | null;
}

function getStats(repos: Repos, directory?: string): SessionStats[] {
  const rootSessions = repos.sessions.getRootSessions(directory ?? undefined);
  const childSessions = repos.sessions.getChildSessions();
  const agentCalls = repos.toolCalls.getAgentCalls();
  const modeRows = repos.messages.getModeStats();

  // Map: parent_id -> child sessions
  const childMap = new Map<string, any[]>();
  for (const c of childSessions) {
    if (!c.parent_id) continue;
    if (!childMap.has(c.parent_id)) childMap.set(c.parent_id, []);
    childMap.get(c.parent_id)?.push(c);
  }

  // Map: parent_session_id -> { agent_type -> call_count }
  const agentMap = new Map<string, Map<string, number>>();
  for (const a of agentCalls) {
    if (!agentMap.has(a.session_id)) agentMap.set(a.session_id, new Map());
    agentMap.get(a.session_id)?.set(a.agent_type, a.call_count);
  }

  // Map: session_id -> ModeStats[]
  const modeMap = new Map<string, ModeStats[]>();
  for (const m of modeRows) {
    if (!modeMap.has(m.session_id)) modeMap.set(m.session_id, []);
    modeMap.get(m.session_id)?.push({
      agent: m.agent,
      message_count: m.message_count,
      input_tokens: m.input_tokens,
      output_tokens: m.output_tokens,
      reasoning_tokens: m.reasoning_tokens,
      cache_read_tokens: m.cache_read_tokens,
      cost: m.cost,
      model_id: m.model_id ?? null,
      provider_id: m.provider_id ?? null,
    });
  }

  return rootSessions.map((s) => {
    const children = childMap.get(s.session_id) || [];
    const agentCallCounts = agentMap.get(s.session_id) || new Map();

    // Build agent details from child sessions
    // Extract agent_type from child title pattern: "... (@agent-type subagent)"
    const agentDetails: AgentStats[] = [];
    const seenAgents = new Map<string, AgentStats>();

    for (const child of children) {
      // Parse agent type from title like "PM says Ja (@product-manager subagent)"
      const match = child.title?.match(/@(\S+)\s+subagent/);
      const agentType = match?.[1] ?? "subagent";

      if (seenAgents.has(agentType)) {
        // Aggregate multiple calls of same agent type
        const existing = seenAgents.get(agentType)!;
        existing.call_count += 1;
        existing.input_tokens += child.input_tokens;
        existing.output_tokens += child.output_tokens;
        existing.reasoning_tokens += child.reasoning_tokens;
        existing.cache_read_tokens += child.cache_read_tokens;
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
        };
        seenAgents.set(agentType, stats);
        agentDetails.push(stats);
      }
    }

    // Override call_count from tool_calls if available (more accurate)
    for (const agent of agentDetails) {
      const count = agentCallCounts.get(agent.agent_type);
      if (count) agent.call_count = count;
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
        });
      }
    }

    // Total = own tokens + all child tokens
    const childIn = agentDetails.reduce((sum, a) => sum + a.input_tokens, 0);
    const childOut = agentDetails.reduce((sum, a) => sum + a.output_tokens, 0);
    const childReasoning = agentDetails.reduce(
      (sum, a) => sum + a.reasoning_tokens,
      0,
    );
    const childCache = agentDetails.reduce(
      (sum, a) => sum + a.cache_read_tokens,
      0,
    );

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
      modes: modeMap.get(s.session_id) || [],
    };
  });
}

function getTokenSummary(repos: Repos): TokenSummary {
  return repos.messages.getTokenSummary();
}

function getDailyTokens(repos: Repos): DailyTokens[] {
  const today = new Date().toISOString().slice(0, 10);
  const todayRow = repos.messages.getTodayTokens(today);

  const historyRows = repos.dailyUsage.getHistoryUntil(today, 60);

  // Merge and fill gaps
  const dataMap = new Map<string, number>();
  for (const row of historyRows) dataMap.set(row.date, row.total);
  dataMap.set(todayRow.date, todayRow.total);

  const result: DailyTokens[] = [];
  for (let i = 59; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, total: dataMap.get(key) ?? 0 });
  }

  return result;
}

function getDailyTokensByModel(repos: Repos): DailyModelTokens[] {
  return repos.messages.getDailyTokensByModel();
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE");
}

export function fmtCompact(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return m % 1 === 0 ? `${Math.round(m)}m` : `${m.toFixed(1)}m`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return k % 1 === 0 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
  }
  return n.toString();
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderTokens(
  input: number,
  cache: number,
  output: number,
  reasoning: number,
): string {
  const totalIn = input + cache;
  const cachePercent = totalIn > 0 ? Math.round((cache / totalIn) * 100) : 0;
  const cacheInfo =
    cache > 0
      ? ` <span class="token-cache">(${cachePercent}% cached)<span class="info-icon" title="Cache-Read-Tokens: Input-Tokens die der Provider aus seinem Prompt-Cache liest statt neu zu verarbeiten. In langen Konversationen bleibt der bisherige Kontext (System-Prompt, vorherige Nachrichten, Tool-Outputs) gecached. Das ist schneller und günstiger (bis zu 90% Rabatt bei Anthropic).">?</span></span>`
      : "";

  let html = `<span class="token-in">${fmtCompact(totalIn)} in</span>${cacheInfo}`;
  html += ` <span class="token-sep">/</span> <span class="token-out">${fmtCompact(output)} out</span>`;
  if (reasoning > 0) {
    html += ` <span class="token-sep">/</span> <span class="token-reasoning">${fmtCompact(reasoning)} reasoning</span>`;
  }
  return html;
}

function recencyClass(lastSeen: string | null | undefined): string {
  if (!lastSeen) return "";
  const iso = lastSeen.replace(" ", "T") + "Z";
  const ageSec = (Date.now() - Date.parse(iso)) / 1000;
  if (Number.isNaN(ageSec) || ageSec < 0) return "";
  if (ageSec < 30) return "session-card--active";
  if (ageSec < 120) return "session-card--recent";
  if (ageSec < 600) return "session-card--idle";
  return "";
}

function renderSessionCard(s: SessionStats): string {
  const title = s.title || s.directory?.split("/").pop() || s.session_id;
  const time = s.last_seen?.replace("T", " ").slice(0, 16) ?? "";
  const recency = recencyClass(s.last_seen);

  const agentRows = s.agents
    .map((a) => {
      const agentTokens = renderTokens(
        a.input_tokens,
        a.cache_read_tokens,
        a.output_tokens,
        a.reasoning_tokens,
      );
      const model = a.model_id
        ? `<span class="agent-model">${esc(a.model_id)}</span>`
        : "";
      return `
      <div class="agent-row">
        <span class="agent-badge">${esc(a.agent_type)}</span>
        <span class="agent-calls">${a.call_count}x</span>
        ${model}
        <span class="tokens-detail">${agentTokens}</span>
      </div>`;
    })
    .join("");

  const sessionTokens = renderTokens(
    s.input_tokens,
    s.cache_read_tokens,
    s.output_tokens,
    s.reasoning_tokens,
  );

  const modeRows = s.modes
    .map((m) => {
      const modeTokens = renderTokens(
        m.input_tokens,
        m.cache_read_tokens,
        m.output_tokens,
        m.reasoning_tokens,
      );
      const label = m.agent.charAt(0).toUpperCase() + m.agent.slice(1);
      const modelInfo =
        m.provider_id || m.model_id
          ? ` <span class="mode-model">${esc([m.provider_id, m.model_id].filter(Boolean).join(" / "))}</span>`
          : "";
      const costStr =
        m.cost > 0
          ? ` <span class="mode-cost">$${m.cost.toFixed(4)}</span>`
          : "";
      return `
      <div class="mode-row">
        <span class="mode-badge mode-${esc(m.agent)}">${esc(label)}</span>
        ${modelInfo}
        <span class="mode-msgs">${m.message_count} msgs</span>
        <span class="tokens-detail">${modeTokens}</span>
        ${costStr}
      </div>`;
    })
    .join("");

  return `
    <div class="session-card${recency ? ` ${recency}` : ""}">
      <div class="session-header">
        <div class="session-title">${esc(title)}</div>
        <div class="session-time">${time}</div>
      </div>
      <div class="session-meta">
        ${s.directory ? `<span class="session-dir">${esc(s.directory)}</span>` : ""}
        <span class="session-id">${esc(s.session_id)}</span>
      </div>
      <div class="session-tokens">
        <span class="token-label">Tokens:</span>
        ${sessionTokens}
      </div>
      ${agentRows ? `<div class="agents-section"><div class="agents-label">Agents</div>${agentRows}</div>` : ""}
      ${modeRows ? `<div class="agents-section"><div class="agents-label">Mode</div>${modeRows}</div>` : ""}
    </div>`;
}

function renderStatsBar(summary: TokenSummary): string {
  return `
    <div class="stats-bar">
      <span class="stats-badge"><span class="mode-badge mode-overall">Overall</span></span>
      <span class="stats-pair"><span class="stats-label">Today:</span><span class="stats-value">${fmtCompact(summary.today)}</span></span>
      <span class="stats-pair"><span class="stats-label">This Week:</span><span class="stats-value">${fmtCompact(summary.thisWeek)}</span></span>
      <span class="stats-pair"><span class="stats-label">This Month:</span><span class="stats-value">${fmtCompact(summary.thisMonth)}</span></span>
      <span class="stats-pair"><span class="stats-label">Last Month:</span><span class="stats-value">${fmtCompact(summary.lastMonth)}</span></span>
    </div>`;
}

function renderDailyChart(daily: DailyTokens[]): string {
  // Build a map from DB data
  const dataMap = new Map<string, number>();
  for (const d of daily) dataMap.set(d.date, d.total);

  // Always render 60 days
  const days: { date: string; total: number }[] = [];
  for (let i = 59; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, total: dataMap.get(key) ?? 0 });
  }

  const max = Math.max(...days.map((d) => d.total));

  const bars = days
    .map((d) => {
      const pct =
        max > 0 && d.total > 0
          ? Math.max(1, Math.round((d.total / max) * 100))
          : 0;
      // Format date as "Mon, 09 May"
      const dateObj = new Date(`${d.date}T00:00:00`);
      const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });
      const day = String(dateObj.getDate()).padStart(2, "0");
      const month = dateObj.toLocaleDateString("en-US", { month: "short" });
      const tooltipDate = `${weekday}, ${day} ${month}`;
      const tooltipTokens = fmt(d.total);
      return `
      <div class="chart-col">
        ${d.total > 0 ? `<div class="chart-value">${d.total >= 1000 ? `${Math.round(d.total / 1000)}k` : d.total}</div>` : ""}
        <div class="chart-bar" style="height: ${pct}%"></div>
        <div class="chart-tooltip">${tooltipDate}<br>${tooltipTokens} tokens</div>
      </div>`;
    })
    .join("");

  // Compute 5-day rolling average
  const avgPoints: { x: number; y: number }[] = [];
  for (let i = 0; i < days.length; i++) {
    const window = days.slice(Math.max(0, i - 4), i + 1);
    const avg = window.reduce((s, d) => s + d.total, 0) / window.length;
    const xPct = ((i + 0.5) / days.length) * 100;
    const yPct = max > 0 ? 100 - (avg / max) * 100 : 100;
    avgPoints.push({ x: xPct, y: yPct });
  }
  const polyline = avgPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return `
    <div class="daily-chart">
      <div class="chart-title">Daily Token Usage (last 60 days)</div>
      <div class="chart-container">
        ${bars}
        <svg class="chart-avg-line" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline points="${polyline}" fill="none" stroke="#f0883e" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
        </svg>
      </div>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-bar"></span>Daily tokens</span>
        <span class="legend-item"><span class="legend-line"></span>5-day avg</span>
      </div>
    </div>`;
}

const MODEL_COLORS = [
  "#58a6ff",
  "#3fb950",
  "#d2a8ff",
  "#f0883e",
  "#f85149",
  "#79c0ff",
  "#56d364",
  "#e3b341",
  "#bc8cff",
  "#ff7b72",
];

function renderDailyModelChart(modelData: DailyModelTokens[]): string {
  // Collect all unique models (sorted by total usage desc for consistent legend order)
  const modelTotals = new Map<string, number>();
  for (const d of modelData) {
    modelTotals.set(d.model, (modelTotals.get(d.model) ?? 0) + d.total);
  }
  const models = [...modelTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([m]) => m);

  const colorMap = new Map<string, string>();
  for (const [i, m] of models.entries()) {
    colorMap.set(m, MODEL_COLORS[i % MODEL_COLORS.length]!);
  }

  // Build map: date -> { model -> total }
  const dataMap = new Map<string, Map<string, number>>();
  for (const d of modelData) {
    if (!dataMap.has(d.date)) dataMap.set(d.date, new Map());
    dataMap.get(d.date)?.set(d.model, d.total);
  }

  // 60 days
  const days: { date: string; byModel: Map<string, number>; total: number }[] =
    [];
  for (let i = 59; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const key = dt.toISOString().slice(0, 10);
    const byModel = dataMap.get(key) ?? new Map();
    const total = [...byModel.values()].reduce((s, v) => s + v, 0);
    days.push({ date: key, byModel, total });
  }

  const max = Math.max(...days.map((d) => d.total), 1);

  const bars = days
    .map((d) => {
      const dateObj = new Date(`${d.date}T00:00:00`);
      const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });
      const day = String(dateObj.getDate()).padStart(2, "0");
      const month = dateObj.toLocaleDateString("en-US", { month: "short" });
      const tooltipDate = `${weekday}, ${day} ${month}`;

      // Stacked segments (bottom to top = models array order)
      const segments = models
        .map((m) => {
          const val = d.byModel.get(m) ?? 0;
          if (val === 0) return "";
          const pct = (val / max) * 100;
          const color = colorMap.get(m)!;
          return `<div class="model-bar-seg" style="height:${pct}%;background:${color}"></div>`;
        })
        .join("");

      // Tooltip breakdown
      const tooltipLines = models
        .filter((m) => (d.byModel.get(m) ?? 0) > 0)
        .map((m) => {
          const color = colorMap.get(m)!;
          return `<span style="color:${color}">\u25A0</span> ${esc(m)}: ${fmt(d.byModel.get(m)!)}`;
        })
        .join("<br>");

      return `
      <div class="chart-col">
        <div class="model-bar-stack" style="height:${max > 0 && d.total > 0 ? Math.max(1, Math.round((d.total / max) * 100)) : 0}%">
          ${segments}
        </div>
        <div class="chart-tooltip">${tooltipDate}<br>${tooltipLines}</div>
      </div>`;
    })
    .join("");

  const legend = models
    .map((m) => {
      const color = colorMap.get(m)!;
      return `<span class="legend-item"><span class="legend-bar" style="background:${color}"></span>${esc(m)}</span>`;
    })
    .join("");

  return `
    <div class="daily-chart">
      <div class="chart-title">Daily Token Usage by Model (last 60 days)</div>
      <div class="chart-container">
        ${bars}
      </div>
      <div class="chart-legend">
        ${legend}
      </div>
    </div>`;
}

function getToolUsageSummary(repos: Repos): ToolGroupSummary[] {
  return repos.toolCalls.getToolUsageSummary();
}

function renderToolUsage(groups: ToolGroupSummary[]): string {
  if (groups.length === 0) return "";

  const visibleGroups = groups.filter((g) => g.agent !== null);

  const groupsHtml = visibleGroups
    .map((g) => {
      const label = g.agent
        ? g.agent.charAt(0).toUpperCase() + g.agent.slice(1)
        : "Unknown";
      const modelInfo =
        [g.provider_id, g.model_id].filter(Boolean).join(" / ") || "unknown";
      const totalCalls = g.tools.reduce(
        (s, t) => s + t.thisMonth + t.lastMonth,
        0,
      );
      const groupKey = `${g.agent ?? "__none__"}|${g.provider_id ?? "__none__"}|${g.model_id ?? "__none__"}`;

      const toolRows = g.tools
        .map(
          (t) => `
      <div class="tool-row">
        <span class="tool-name">${esc(t.tool_name)}</span>
        <span class="stats-pair"><span class="stats-label">Today:</span><span class="stats-value">${fmt(t.today)}</span></span>
        <span class="stats-pair"><span class="stats-label">This Week:</span><span class="stats-value">${fmt(t.thisWeek)}</span></span>
        <span class="stats-pair"><span class="stats-label">This Month:</span><span class="stats-value">${fmt(t.thisMonth)}</span></span>
        <span class="stats-pair"><span class="stats-label">Last Month:</span><span class="stats-value">${fmt(t.lastMonth)}</span></span>
      </div>`,
        )
        .join("");

      return `
      <details class="tool-group" data-group-key="${esc(groupKey)}">
        <summary class="tool-group-header">
          <span class="mode-badge mode-${esc(g.agent ?? "unknown")}">${esc(label)}</span>
          <span class="tool-group-model">${esc(modelInfo)}</span>
          <span class="tool-group-total">${fmt(totalCalls)} calls</span>
        </summary>
        <div class="tool-group-body">${toolRows}</div>
      </details>`;
    })
    .join("");

  return `
    <div class="tool-usage-section">
      <div class="chart-title">Tool Usage</div>
      ${groupsHtml}
    </div>`;
}

function renderSessionsFragment(
  sessions: SessionStats[],
  summary: TokenSummary,
  daily: DailyTokens[],
  dailyModel: DailyModelTokens[],
  toolGroups: ToolGroupSummary[],
  directories: string[],
  selectedDir?: string,
): string {
  const bar = renderStatsBar(summary);
  const chart = renderDailyChart(daily);
  const modelChart = renderDailyModelChart(dailyModel);
  const toolUsage = renderToolUsage(toolGroups);

  const leftPanel = `
    <div class="left-panel">
      ${bar}
      <hr class="section-divider">
      ${chart}
      ${modelChart}
      ${toolUsage}
    </div>`;

  const sessionCards =
    sessions.length === 0
      ? '<div class="empty">No sessions recorded yet.</div>'
      : sessions.map(renderSessionCard).join("");

  const dirOptions = directories.map((d) => `<option value="${esc(d)}"${d === selectedDir ? " selected" : ""}>${esc(d)}</option>`).join("");
  const dirDropdown = `
    <div class="filter-bar">
      <select id="dir-filter">
        <option value="">All directories</option>
        ${dirOptions}
      </select>
    </div>`;

  const rightPanel = `
    <div class="right-panel">
      ${dirDropdown}
      ${sessionCards}
    </div>`;

  return `<div class="two-col">${leftPanel}${rightPanel}</div>`;
}

function renderHTML(
  sessions: SessionStats[],
  summary: TokenSummary,
  daily: DailyTokens[],
  dailyModel: DailyModelTokens[],
  toolGroups: ToolGroupSummary[],
  directories: string[],
  selectedDir?: string,
): string {
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
      max-width: none;
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
      font-size: 12px; color: #8b949e;
      display: flex; align-items: center; gap: 10px;
    }
    .refresh-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #238636;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    .refresh-timing {
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      background: #1f2937;
      color: #6e7681;
      border: 1px solid #30363d;
      transition: all 0.3s;
    }
    .refresh-timing.slow {
      background: #3a2f1a;
      color: #d29922;
      border-color: #5c4a1f;
    }
    .refresh-timing.very-slow {
      background: #3a2416;
      color: #f0883e;
      border-color: #5c3d1f;
    }
    .session-card {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      transition: border-color 0.2s;
    }
    .session-card:hover { border-color: #388bfd; }
    .session-card--active {
      border-color: #56d364;
      box-shadow: 0 0 0 1px #56d364, 0 0 12px rgba(86, 211, 100, 0.35);
    }
    .session-card--recent {
      border-color: #3fb950;
    }
    .session-card--idle {
      border-color: #1a4d1f;
    }
    .session-header {
      display: flex; justify-content: space-between;
      align-items: center; margin-bottom: 4px;
    }
    .session-title { font-size: 15px; font-weight: 600; color: #f0f6fc; }
    .session-time { font-size: 12px; color: #484f58; }
    .session-meta {
      display: flex; gap: 8px; align-items: center;
      margin-bottom: 8px; font-size: 11px;
      word-break: break-all;
    }
    .session-id { color: #484f58; }
    .session-dir { color: #8b949e; }
    .session-dir::after { content: "|"; margin-left: 8px; color: #30363d; }
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
    .mode-row {
      display: flex; align-items: center; gap: 10px;
      padding: 4px 0 4px 12px; font-size: 13px;
      border-left: 2px solid #21262d; margin-bottom: 4px;
    }
    .mode-badge {
      background: #1f2937; border: 1px solid #30363d;
      border-radius: 4px; padding: 1px 8px;
      font-size: 12px; white-space: nowrap;
    }
    .mode-plan { color: #3fb950; border-color: #238636; }
    .mode-build { color: #f0883e; border-color: #d47616; }
    .mode-msgs { color: #8b949e; font-size: 12px; min-width: 50px; }
    .mode-model { color: #484f58; font-size: 11px; }
    .mode-cost { color: #f0883e; font-size: 12px; }
    .empty {
      text-align: center; color: #484f58;
      padding: 48px; font-size: 14px;
    }
    .stats-bar {
      display: flex;
      align-items: center;
      padding: 8px 0; margin-bottom: 0;
      font-size: 12px;
      white-space: nowrap;
    }
    .stats-pair {
      width: 160px;
      flex-shrink: 0;
    }
    .stats-label { color: #8b949e; }
    .stats-value { color: #f0f6fc; font-weight: 600; margin-left: 4px; }
    .stats-badge { width: 190px; flex-shrink: 0; }
    .mode-stats-bar {
      margin-bottom: 0; padding: 6px 0;
    }
    .mode-stats-bar:last-of-type {
      margin-bottom: 0;
    }
    .section-divider {
      border: none; border-top: 1px solid #21262d;
      margin: 16px 0;
    }
    .mode-overall { color: #58a6ff; border-color: #1f6feb; }
    .tool-usage-section { margin-bottom: 8px; }
    .tool-group {
      margin-bottom: 12px;
      border: 1px solid #21262d;
      border-radius: 8px;
      background: #161b22;
    }
    .tool-group-header {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px;
      cursor: pointer;
      list-style: none;
    }
    .tool-group-header::-webkit-details-marker { display: none; }
    .tool-group-model { font-size: 11px; color: #484f58; }
    .tool-group-total { margin-left: auto; font-size: 11px; color: #8b949e; }
    .tool-group-body { padding: 0 10px 8px 10px; }
    .tool-row {
      display: grid;
      grid-template-columns: 190px repeat(4, 160px);
      align-items: center;
      padding: 3px 0; font-size: 12px;
      margin-bottom: 2px;
      white-space: nowrap;
    }
    .tool-name {
      justify-self: start;
      background: #1f2937; border: 1px solid #30363d;
      border-radius: 4px; padding: 1px 8px;
      font-size: 12px; color: #8b949e; white-space: nowrap;
    }
    .tool-row .stats-pair { width: 160px; flex-shrink: 0; }
    .daily-chart {
      margin-bottom: 24px; padding-bottom: 16px;
      border-bottom: 1px solid #21262d;
    }
    .chart-title {
      font-size: 12px; color: #8b949e; text-transform: uppercase;
      letter-spacing: 0.5px; margin-bottom: 12px;
    }
    .chart-container {
      display: flex; align-items: flex-end; gap: 2px;
      height: 80px;
      position: relative;
    }
    .chart-avg-line {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
    }
    .chart-col {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: flex-end;
      height: 100%; min-width: 0;
    }
    .chart-value {
      display: none;
      font-size: 9px; color: #8b949e; margin-bottom: 4px;
      white-space: nowrap;
    }
    .chart-col:hover .chart-value { display: block; }
    .chart-bar {
      width: 100%; min-height: 2px;
      background: #238636; border-radius: 2px 2px 0 0;
      transition: background 0.2s;
    }
    .chart-col:hover .chart-bar { background: #3fb950; }
    .chart-col {
      position: relative;
    }
    .chart-tooltip {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background: #1c2128;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      color: #f0f6fc;
      white-space: nowrap;
      text-align: center;
      z-index: 10;
      pointer-events: none;
      line-height: 1.5;
    }
    .chart-col:hover .chart-tooltip { display: block; }
    .chart-legend {
      display: flex; 
      column-gap: 20px;
      row-gap: 4px;
      justify-content: flex-end;
      flex-wrap: wrap;
      margin-top: 8px; font-size: 11px; color: #8b949e;
      line-height: 1.2;
    }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .legend-bar {
      width: 12px; height: 8px; background: #238636;
      border-radius: 2px; display: inline-block;
    }
    .legend-line {
      width: 16px; height: 2px; background: #f0883e;
      display: inline-block; border-radius: 1px;
    }
    .model-bar-stack {
      width: 100%; display: flex; flex-direction: column-reverse;
      border-radius: 2px 2px 0 0; overflow: hidden;
    }
    .model-bar-seg {
      width: 100%; min-height: 0;
    }
    .two-col {
      display: flex; gap: 24px; align-items: flex-start;
    }
    .left-panel {
      flex: 1; min-width: 0;
      position: sticky; top: 24px; align-self: flex-start;
      background: rgba(255, 255, 255, 0.02);
      border-radius: 8px;
      padding: 16px 24px 16px 16px;
    }
    .right-panel {
      flex: 1; min-width: 0;
      border-left: 1px solid #21262d;
      padding-left: 24px;
    }
    @media (max-width: 1000px) {
      .two-col { flex-direction: column; }
      .left-panel { position: static; }
    }
    #dir-filter {
      appearance: none;
      -webkit-appearance: none;
      background: #161b22 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' fill='none' stroke='%238b949e' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 12px center;
      color: #c9d1d9;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 8px 36px 8px 12px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      width: 100%;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    #dir-filter:hover { border-color: #484f58; }
    #dir-filter:focus { outline: none; border-color: #58a6ff; box-shadow: 0 0 0 2px rgba(56,139,253,0.25); }
    .filter-bar {
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>OpenCode Usage Stats</h1>
    <div class="refresh-badge">
      <div class="refresh-dot"></div>
      <span>auto-refresh 5s</span>
      <span id="refresh-timing" class="refresh-timing"></span>
    </div>
  </div>
  <div id="sessions">
    ${renderSessionsFragment(sessions, summary, daily, dailyModel, toolGroups, directories, selectedDir)}
  </div>
  <script>
    function collectOpenToolGroups() {
      const open = new Set();
      document.querySelectorAll('.tool-group[data-group-key]').forEach((el) => {
        if (el.open) {
          const key = el.getAttribute('data-group-key');
          if (key) open.add(key);
        }
      });
      return open;
    }

    function restoreOpenToolGroups(openKeys) {
      const groups = document.querySelectorAll('.tool-group[data-group-key]');
      let opened = 0;
      groups.forEach((el) => {
        const key = el.getAttribute('data-group-key');
        const shouldOpen = !!key && openKeys.has(key);
        el.open = shouldOpen;
        if (shouldOpen) opened += 1;
      });

    }

    let currentDirFilter = "";

    function attachDirFilter() {
      const el = document.getElementById("dir-filter");
      if (!el) return;
      el.value = currentDirFilter;
      el.addEventListener("change", function() {
        currentDirFilter = el.value;
        refresh();
      });
    }

    async function refresh() {
      const start = performance.now();
      const openToolGroups = collectOpenToolGroups();
      const dirEl = document.getElementById("dir-filter");
      if (dirEl) currentDirFilter = dirEl.value;
      const params = currentDirFilter ? "?dir=" + encodeURIComponent(currentDirFilter) : "";
      try {
        const res = await fetch("/api/stats" + params);
        const html = await res.text();
        document.getElementById("sessions").innerHTML = html;
        attachDirFilter();
        restoreOpenToolGroups(openToolGroups);
        const duration = Math.round(performance.now() - start);
        updateRefreshTiming(duration);
      } catch {
        updateRefreshTiming(null);
      }
    }
    function updateRefreshTiming(ms) {
      const el = document.getElementById("refresh-timing");
      if (ms === null) {
        el.textContent = "failed";
        el.className = "refresh-timing very-slow";
        return;
      }
      el.textContent = \`took \${ms}ms\`;
      if (ms > 1000) {
        el.className = "refresh-timing very-slow";
      } else if (ms > 500) {
        el.className = "refresh-timing slow";
      } else {
        el.className = "refresh-timing";
      }
    }
    setInterval(refresh, 5000);
    attachDirFilter();
  </script>
</body>
</html>`;
}

async function isPortInUse(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/`, {
      signal: AbortSignal.timeout(500),
    });
    await response.text();
    return true;
  } catch {
    return false;
  }
}

if (import.meta.main) {
  const portBusy = await isPortInUse(PORT);
  if (!portBusy) {
    // Initial aggregation on dashboard startup
    try {
      const repos = createSqliteRepos(DB_PATH);
      const today = new Date().toISOString().slice(0, 10);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      repos.dailyUsage.recompute(sevenDaysAgo, today);
      lastAggregation = Date.now();

      // Run GC on startup
      gcOldData(repos, 90);
      lastGC = Date.now();

      repos.close();
    } catch (e) {
      console.error("Initial aggregation/GC failed:", e);
    }

    const readRepos = createSqliteRepos(DB_PATH, { readonly: true });

    Bun.serve({
      port: PORT,
      async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/api/stats") {
          // 1/100 chance to trigger aggregation (with 60s minimum interval)
          if (Math.random() < 0.01) {
            const now = Date.now();
            if (now - lastAggregation >= MIN_AGGREGATION_INTERVAL_MS) {
              lastAggregation = now;
              try {
                const repos = createSqliteRepos(DB_PATH);
                const sevenDaysAgo = new Date(
                  Date.now() - 7 * 24 * 60 * 60 * 1000,
                )
                  .toISOString()
                  .slice(0, 10);
                const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
                  .toISOString()
                  .slice(0, 10);
                repos.dailyUsage.recompute(sevenDaysAgo, yesterday);
                repos.close();
              } catch (e) {
                console.error("Background aggregation failed:", e);
              }
            }
          }

          // 1/500 chance to trigger GC (with 24h minimum interval)
          if (Math.random() < 0.002) {
            const now = Date.now();
            if (now - lastGC >= MIN_GC_INTERVAL_MS) {
              lastGC = now;
              try {
                const repos = createSqliteRepos(DB_PATH);
                gcOldData(repos, 90);
                repos.close();
              } catch (e) {
                console.error("Background GC failed:", e);
              }
            }
          }

          try {
            const dirFilter = url.searchParams.get("dir") || undefined;
            const directories = readRepos.sessions.getDistinctDirectories();
            const sessions = getStats(readRepos, dirFilter);
            const summary = getTokenSummary(readRepos);
            const daily = getDailyTokens(readRepos);
            const dailyModel = getDailyTokensByModel(readRepos);
            const toolGroups = getToolUsageSummary(readRepos);
            return new Response(
              renderSessionsFragment(
                sessions,
                summary,
                daily,
                dailyModel,
                toolGroups,
                directories,
                dirFilter,
              ),
              {
                headers: { "Content-Type": "text/html; charset=utf-8" },
              },
            );
          } catch (e) {
            return new Response(`<div class="empty">DB error: ${e}</div>`, {
              headers: { "Content-Type": "text/html; charset=utf-8" },
            });
          }
        }

        if (url.pathname === "/api/directories") {
          try {
            const dirs = readRepos.sessions.getDistinctDirectories();
            return new Response(JSON.stringify(dirs), {
              headers: { "Content-Type": "application/json; charset=utf-8" },
            });
          } catch (e) {
            return new Response("[]", {
              headers: { "Content-Type": "application/json; charset=utf-8" },
            });
          }
        }

        try {
          const dirFilter = url.searchParams.get("dir") || undefined;
          const directories = readRepos.sessions.getDistinctDirectories();
          const sessions = getStats(readRepos, dirFilter);
          const summary = getTokenSummary(readRepos);
          const daily = getDailyTokens(readRepos);
          const dailyModel = getDailyTokensByModel(readRepos);
          const toolGroups = getToolUsageSummary(readRepos);
          return new Response(
            renderHTML(sessions, summary, daily, dailyModel, toolGroups, directories, dirFilter),
            {
              headers: { "Content-Type": "text/html; charset=utf-8" },
            },
          );
        } catch (e) {
          return new Response(`DB error: ${e}`, { status: 500 });
        }
      },
    });
    console.log(`Dashboard running at http://localhost:${PORT}`);
  } else {
    console.log(`Dashboard already running on port ${PORT}, skipping.`);
  }
}
