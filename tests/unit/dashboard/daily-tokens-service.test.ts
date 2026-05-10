import { describe, expect, test } from "bun:test";
import { createDailyTokensService } from "../../../src/dashboard/services/daily-tokens-service";
import type { Repos } from "../../../src/db/repos";

function makeStubRepos(
  overrides: Partial<{
    todayTokens: { date: string; total: number };
    history: { date: string; total: number }[];
    tokenSummary: {
      today: number;
      thisWeek: number;
      thisMonth: number;
      lastMonth: number;
    };
    dailyModel: { date: string; model: string; total: number }[];
  }> = {},
): Repos {
  return {
    sessions: {
      getRootSessions: () => [],
      getChildSessions: () => [],
      upsert: () => {},
      upsertFull: () => {},
      deleteOrphaned: () => 0,
    },
    messages: {
      getModeStats: () => [],
      getTokenSummary: () =>
        overrides.tokenSummary ?? {
          today: 0,
          thisWeek: 0,
          thisMonth: 0,
          lastMonth: 0,
        },
      getTodayTokens: () =>
        overrides.todayTokens ?? {
          date: new Date().toISOString().slice(0, 10),
          total: 0,
        },
      getDailyTokensByModel: () => overrides.dailyModel ?? [],
      upsert: () => {},
      deleteOlderThan: () => 0,
    },
    toolCalls: {
      getAgentCalls: () => [],
      getToolUsageSummary: () => [],
      insert: () => {},
      deleteOlderThan: () => 0,
    },
    dailyUsage: {
      recompute: () => {},
      getHistoryUntil: () => overrides.history ?? [],
    },
    vacuum: () => {},
    close: () => {},
  };
}

describe("DailyTokensService", () => {
  test("getDailyTokens returns 60 days with gap filling", () => {
    const service = createDailyTokensService(makeStubRepos());
    const result = service.getDailyTokens();
    expect(result).toHaveLength(60);
    expect(result[59]!.date).toBe(new Date().toISOString().slice(0, 10));
  });

  test("getDailyTokens merges today tokens with history", () => {
    const today = new Date().toISOString().slice(0, 10);
    const service = createDailyTokensService(
      makeStubRepos({
        todayTokens: { date: today, total: 500 },
        history: [{ date: today, total: 300 }],
      }),
    );
    const result = service.getDailyTokens();
    const todayEntry = result.find((d) => d.date === today);
    expect(todayEntry!.total).toBe(500);
  });

  test("getTokenSummary delegates to repo", () => {
    const service = createDailyTokensService(
      makeStubRepos({
        tokenSummary: { today: 10, thisWeek: 20, thisMonth: 30, lastMonth: 40 },
      }),
    );
    const summary = service.getTokenSummary();
    expect(summary.today).toBe(10);
    expect(summary.lastMonth).toBe(40);
  });

  test("getDailyTokensByModel delegates to repo", () => {
    const data = [{ date: "2025-01-01", model: "test", total: 100 }];
    const service = createDailyTokensService(
      makeStubRepos({ dailyModel: data }),
    );
    expect(service.getDailyTokensByModel()).toEqual(data);
  });
});
