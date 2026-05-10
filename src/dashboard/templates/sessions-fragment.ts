import type {
  DailyModelTokens,
  TokenSummary,
} from "../../db/message/message-repo";
import type { DailyTokens } from "../../db/shared-types";
import type { ToolGroupSummary } from "../../db/tool-call/tool-call-repo";
import type { SessionStats } from "../services/types";
import { renderDailyChart } from "./daily-chart";
import { renderDailyModelChart } from "./model-chart";
import { renderSessionCard } from "./session-card";
import { renderStatsBar } from "./stats-bar";
import { renderToolUsage } from "./tool-usage";

export function renderSessionsFragment(
  sessions: SessionStats[],
  summary: TokenSummary,
  daily: DailyTokens[],
  dailyModel: DailyModelTokens[],
  toolGroups: ToolGroupSummary[],
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

  const rightPanel = `
    <div class="right-panel">
      <div class="right-panel-title">Sessions</div>
      ${sessionCards}
    </div>`;

  return `<div class="two-col">${leftPanel}${rightPanel}</div>`;
}
