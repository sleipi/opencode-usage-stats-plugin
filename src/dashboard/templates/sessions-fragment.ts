import type {
  CostSummary,
  DailyModelTokens,
  TokenSummary,
} from "../../db/message/message-repo";
import type { DailyTokens } from "../../db/shared-types";
import type { ToolGroupSummary } from "../../db/tool-call/tool-call-repo";
import type { SessionStats } from "../services/types";
import { renderDailyCostChart, renderDailyChart } from "./daily-chart";
import { esc } from "./formatters";
import { renderDailyModelChart, renderDailyModelCostChart } from "./model-chart";
import { renderSessionCard } from "./session-card";
import { renderStatsBar } from "./stats-bar";
import { renderToolUsage } from "./tool-usage";

export function renderSessionsFragment(
  sessions: SessionStats[],
  summary: TokenSummary,
  costSummary: CostSummary,
  daily: DailyTokens[],
  dailyModel: DailyModelTokens[],
  toolGroups: ToolGroupSummary[],
  directories: string[] = [],
  selectedDir?: string,
  dailyCost: DailyTokens[] = [],
  dailyModelCost: DailyModelTokens[] = [],
): string {
  const bar = renderStatsBar(summary, costSummary);
  const chart = renderDailyChart(daily);
  const costChart = renderDailyCostChart(dailyCost);
  const modelChart = renderDailyModelChart(dailyModel);
  const modelCostChart = renderDailyModelCostChart(dailyModelCost);
  const toolUsage = renderToolUsage(toolGroups);

  const leftPanel = `
    <div class="left-panel">
      ${bar}
      <hr class="section-divider">
      ${chart}
      ${costChart}
      ${modelChart}
      ${modelCostChart}
      ${toolUsage}
    </div>`;

  const sessionCards =
    sessions.length === 0
      ? '<div class="empty">No sessions recorded yet.</div>'
      : sessions.map(renderSessionCard).join("");

  const dirOptions = directories
    .map(
      (d) =>
        `<option value="${esc(d)}"${d === selectedDir ? " selected" : ""}>${esc(d)}</option>`,
    )
    .join("");
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
