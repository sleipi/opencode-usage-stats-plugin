import type { BudgetSettings } from "../../db/budget/budget-repo";

export interface BudgetStatus {
  amount: number;
  spent: number;
  expected: number;
  delta: number;
  remaining: number;
  remainingPct: number;
  resetDate: Date;
  workDaysTotal: number;
  workDaysElapsed: number;
}

export function calcBudgetStatus(
  settings: BudgetSettings,
  spentThisMonth: number,
  now: Date,
): BudgetStatus {
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startDay = Math.min(settings.periodStartDay, lastDay);
  const todayDate = now.getDate();

  let workDaysTotal = 0;
  for (let d = startDay; d <= lastDay; d++) {
    if ((settings.workDays >> new Date(year, month, d).getDay()) & 1)
      workDaysTotal++;
  }

  let workDaysElapsed = 0;
  const elapsedEnd = Math.min(todayDate, lastDay + 1);
  for (let d = startDay; d < elapsedEnd; d++) {
    if ((settings.workDays >> new Date(year, month, d).getDay()) & 1)
      workDaysElapsed++;
  }

  const expected =
    workDaysTotal > 0 ? settings.amount * (workDaysElapsed / workDaysTotal) : 0;
  const delta = spentThisMonth - expected;
  const remaining = settings.amount - spentThisMonth;
  const remainingPct =
    settings.amount > 0
      ? Math.max(0, Math.min(100, (remaining / settings.amount) * 100))
      : 0;
  const resetDate = new Date(year, month + 1, 1);

  return {
    amount: settings.amount,
    spent: spentThisMonth,
    expected,
    delta,
    remaining,
    remainingPct,
    resetDate,
    workDaysTotal,
    workDaysElapsed,
  };
}
