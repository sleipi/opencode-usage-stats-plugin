import { describe, expect, test } from "bun:test";
import { createMaintenanceService } from "../../../src/dashboard/services/maintenance-service";
import type { Repos } from "../../../src/db/repos";

function makeStubRepos(): Repos {
  return {
    sessions: {
      getRootSessions: () => [],
      getChildSessions: () => [],
      getDistinctDirectories: () => [],
      upsert: () => {},
      upsertFull: () => {},
      deleteOrphaned: () => 0,
    },
    messages: {
      getModeStats: () => [],
      getTokenSummary: () => ({
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
        lastMonth: 0,
      }),
      getTodayTokens: () => ({ date: "2025-01-01", total: 0 }),
      getTodayCost: () => ({ date: "2025-01-01", total: 0 }),
      getDailyTokensByModel: () => [],
      getDailyModelCost: () => [],
      upsert: () => {},
      deleteOlderThan: () => 0,
      getCostSummary: () => ({
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
        lastMonth: 0,
      }),
    },
    toolCalls: {
      getAgentCalls: () => [],
      getToolUsageSummary: () => [],
      insert: () => {},
      deleteOlderThan: () => 0,
    },
    dailyUsage: {
      recompute: () => {},
      getHistoryUntil: () => [],
      getHistoryUntilCost: () => [],
    },
    budget: {
      get: () => null,
      upsert: () => {},
    },
    vacuum: () => {},
    close: () => {},
  };
}

describe("MaintenanceService", () => {
  test("runInitial calls recompute and gcOldData", () => {
    let recomputeCalled = false;
    let gcCalled = false;
    let closeCalled = false;

    const repos = makeStubRepos();
    repos.dailyUsage.recompute = () => {
      recomputeCalled = true;
    };
    repos.close = () => {
      closeCalled = true;
    };

    const service = createMaintenanceService({
      createWriteRepos: () => repos,
      gcOldData: () => {
        gcCalled = true;
        return { messages: 0, toolCalls: 0, sessions: 0 };
      },
    });

    service.runInitial();
    expect(recomputeCalled).toBe(true);
    expect(gcCalled).toBe(true);
    expect(closeCalled).toBe(true);
  });

  test("maybeAggregate with probability=0 never runs", () => {
    let called = false;
    const repos = makeStubRepos();
    repos.dailyUsage.recompute = () => {
      called = true;
    };

    const service = createMaintenanceService({
      createWriteRepos: () => repos,
      gcOldData: () => ({ messages: 0, toolCalls: 0, sessions: 0 }),
      aggregationProbability: 0,
    });

    for (let i = 0; i < 100; i++) service.maybeAggregate();
    expect(called).toBe(false);
  });

  test("maybeAggregate with probability=1 runs and respects interval", () => {
    let callCount = 0;
    const repos = makeStubRepos();
    repos.dailyUsage.recompute = () => {
      callCount++;
    };

    const service = createMaintenanceService({
      createWriteRepos: () => repos,
      gcOldData: () => ({ messages: 0, toolCalls: 0, sessions: 0 }),
      aggregationProbability: 1,
      aggregationIntervalMs: 999_999_999,
    });

    service.maybeAggregate();
    service.maybeAggregate();
    expect(callCount).toBe(1);
  });

  test("maybeGC with probability=0 never runs", () => {
    let called = false;
    const service = createMaintenanceService({
      createWriteRepos: makeStubRepos,
      gcOldData: () => {
        called = true;
        return { messages: 0, toolCalls: 0, sessions: 0 };
      },
      gcProbability: 0,
    });

    for (let i = 0; i < 100; i++) service.maybeGC();
    expect(called).toBe(false);
  });

  test("swallows errors from runInitial without throwing", () => {
    const service = createMaintenanceService({
      createWriteRepos: () => {
        throw new Error("DB locked");
      },
      gcOldData: () => ({ messages: 0, toolCalls: 0, sessions: 0 }),
    });

    expect(() => service.runInitial()).not.toThrow();
  });

  test("swallows errors from maybeAggregate without throwing", () => {
    const service = createMaintenanceService({
      createWriteRepos: () => {
        throw new Error("DB locked");
      },
      gcOldData: () => ({ messages: 0, toolCalls: 0, sessions: 0 }),
      aggregationProbability: 1,
      aggregationIntervalMs: 0,
    });

    expect(() => service.maybeAggregate()).not.toThrow();
  });

  test("swallows errors from maybeGC without throwing", () => {
    const service = createMaintenanceService({
      createWriteRepos: () => {
        throw new Error("DB locked");
      },
      gcOldData: () => ({ messages: 0, toolCalls: 0, sessions: 0 }),
      gcProbability: 1,
      gcIntervalMs: 0,
    });

    expect(() => service.maybeGC()).not.toThrow();
  });
});
