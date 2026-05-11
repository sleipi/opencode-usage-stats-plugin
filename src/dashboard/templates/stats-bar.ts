import type { TokenSummary } from "../../db/message/message-repo";
import { fmtCompact } from "./formatters";

export function renderStatsBar(summary: TokenSummary): string {
  return `
    <div class="stats-bar">
      <span class="stats-badge"><span class="mode-badge mode-overall">Overall</span></span>
      <span class="stats-pair"><span class="stats-label">Today:</span><span class="stats-value">${fmtCompact(summary.today)}</span></span>
      <span class="stats-pair"><span class="stats-label">This Week:</span><span class="stats-value">${fmtCompact(summary.thisWeek)}</span></span>
      <span class="stats-pair"><span class="stats-label">This Month:</span><span class="stats-value">${fmtCompact(summary.thisMonth)}</span></span>
      <span class="stats-pair"><span class="stats-label">Last Month:</span><span class="stats-value">${fmtCompact(summary.lastMonth)}</span></span>
    </div>`;
}
