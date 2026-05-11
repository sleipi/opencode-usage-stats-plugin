import type { ToolGroupSummary } from "../../db/tool-call/tool-call-repo";
import { esc, fmt } from "./formatters";

export function renderToolUsage(groups: ToolGroupSummary[]): string {
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
