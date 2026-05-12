import type { CostSummary, TokenSummary } from "../../db/message/message-repo";
import { fmtCompact, fmtCost } from "./formatters";

export function renderStatsBar(
  summary: TokenSummary,
  costSummary: CostSummary,
): string {
  return `
    <div class="stats-bar">
      <span class="stats-badge"><span class="mode-badge mode-overall">Overall</span></span>
      <span class="stats-pair"><span class="stats-label">Today:</span><span class="stats-value">${fmtCompact(summary.today)}</span></span>
      <span class="stats-pair"><span class="stats-label">This Week:</span><span class="stats-value">${fmtCompact(summary.thisWeek)}</span></span>
      <span class="stats-pair"><span class="stats-label">This Month:</span><span class="stats-value">${fmtCompact(summary.thisMonth)}</span></span>
      <span class="stats-pair"><span class="stats-label">Last Month:</span><span class="stats-value">${fmtCompact(summary.lastMonth)}</span></span>
    </div>
    <div class="stats-bar">
      <span class="stats-badge"><span class="mode-badge mode-cost-overall">Overall$</span></span>
      <span class="stats-pair"><span class="stats-label">Today:</span><span class="stats-value cost-value">${fmtCost(costSummary.today)}</span></span>
      <span class="stats-pair"><span class="stats-label">This Week:</span><span class="stats-value cost-value">${fmtCost(costSummary.thisWeek)}</span></span>
      <span class="stats-pair"><span class="stats-label">This Month:</span><span class="stats-value cost-value">${fmtCost(costSummary.thisMonth)}</span></span>
      <span class="stats-pair"><span class="stats-label">Last Month:</span><span class="stats-value cost-value">${fmtCost(costSummary.lastMonth)}</span></span>
    </div>`;
}
