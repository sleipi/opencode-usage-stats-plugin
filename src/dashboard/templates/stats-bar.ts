import type { CostSummary, TokenSummary } from "../../db/message/message-repo";
import type { BudgetStatus } from "../services/budget-service";
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

export function renderBudgetBar(status: BudgetStatus | null): string {
  if (!status) return "";

  const { delta, expected, remaining, remainingPct, resetDate } = status;
  const threshold = expected * 0.02;
  const isOnTrack = Math.abs(delta) <= threshold || expected === 0;
  const isOver = !isOnTrack && delta > 0;

  const badgeClass = isOnTrack
    ? "budget-badge--on-track"
    : isOver
      ? "budget-badge--over"
      : "budget-badge--ahead";
  const badgeText = isOnTrack
    ? "● on track"
    : isOver
      ? `▼ ${fmtCost(Math.abs(delta))} over`
      : `▲ ${fmtCost(Math.abs(delta))} ahead`;

  const remainingText =
    remaining < 0 ? `-${fmtCost(Math.abs(remaining))}` : fmtCost(remaining);
  const resetText = resetDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return `
    <div class="stats-bar">
      <span class="stats-badge"><span class="mode-badge mode-budget">Budget$</span></span>
      <span class="stats-pair"><span class="budget-badge ${badgeClass}">${badgeText}</span></span>
      <span class="stats-pair"><span class="stats-value">${remainingText} left</span><span class="stats-label"> · ${Math.round(remainingPct)}%</span></span>
      <span class="stats-pair"><span class="stats-label">Resets </span><span class="stats-value">${resetText}</span></span>
    </div>`;
}
