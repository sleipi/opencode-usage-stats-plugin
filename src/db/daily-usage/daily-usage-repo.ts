import type { DailyTokens } from "../shared-types";

export interface DailyUsageRepo {
  recompute(fromDay: string, toDay: string): void;
  getHistoryUntil(dayExclusive: string, lookbackDays: number): DailyTokens[];
}
