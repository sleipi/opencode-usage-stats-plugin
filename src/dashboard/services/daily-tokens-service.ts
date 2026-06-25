import type {
  CostSummary,
  DailyModelTokens,
  TokenSummary,
} from "../../db/message/message-repo";
import type { Repos } from "../../db/repos";
import type { DailyTokens } from "../../db/shared-types";

export interface DailyTokensService {
  getDailyTokens(): DailyTokens[];
  getDailyTokensByModel(): DailyModelTokens[];
  getDailyCost(): DailyTokens[];
  getDailyModelCost(): DailyModelTokens[];
  getTokenSummary(): TokenSummary;
  getCostSummary(): CostSummary;
}

export function createDailyTokensService(repos: Repos): DailyTokensService {
  return {
    getDailyTokens(): DailyTokens[] {
      const today = new Date().toISOString().slice(0, 10);
      const todayRow = repos.messages.getTodayTokens(today);
      const historyRows = repos.dailyUsage.getHistoryUntil(today, 60);

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
    },

    getDailyTokensByModel(): DailyModelTokens[] {
      return repos.messages.getDailyTokensByModel();
    },

    getDailyCost(): DailyTokens[] {
      const today = new Date().toISOString().slice(0, 10);
      const todayRow = repos.messages.getTodayCost(today);
      const historyRows = repos.dailyUsage.getHistoryUntilCost(today, 60);

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
    },

    getDailyModelCost(): DailyModelTokens[] {
      return repos.messages.getDailyModelCost();
    },

    getTokenSummary(): TokenSummary {
      return repos.messages.getTokenSummary();
    },

    getCostSummary(): CostSummary {
      return repos.messages.getCostSummary();
    },
  };
}
