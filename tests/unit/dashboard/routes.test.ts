import { describe, expect, test } from "bun:test";
import { createDirectoriesRoute } from "../../../src/dashboard/routes/directories-route";
import { createPageRoute } from "../../../src/dashboard/routes/page-route";
import { createStatsRoute } from "../../../src/dashboard/routes/stats-route";
import type { DailyTokensService } from "../../../src/dashboard/services/daily-tokens-service";
import type { MaintenanceService } from "../../../src/dashboard/services/maintenance-service";
import type { SessionStatsService } from "../../../src/dashboard/services/session-stats-service";
import type { Repos } from "../../../src/db/repos";

function makeStubSessionStats(): SessionStatsService {
  return { getSessionStats: () => [], getDistinctDirectories: () => [] };
}

function makeStubDailyTokens(): DailyTokensService {
  return {
    getDailyTokens: () => [],
    getDailyTokensByModel: () => [],
    getTokenSummary: () => ({
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      lastMonth: 0,
    }),
  };
}

function makeStubMaintenance(): MaintenanceService {
  return {
    runInitial: () => {},
    maybeAggregate: () => {},
    maybeGC: () => {},
  };
}

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
      getDailyTokensByModel: () => [],
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
      getHistoryUntil: () => [],
    },
    vacuum: () => {},
    close: () => {},
  };
}

describe("StatsRoute", () => {
  test("matches /api/stats", () => {
    const route = createStatsRoute(
      makeStubSessionStats(),
      makeStubDailyTokens(),
      makeStubRepos(),
      makeStubMaintenance(),
    );
    expect(route.match(new URL("http://localhost/api/stats"))).toBe(true);
    expect(route.match(new URL("http://localhost/"))).toBe(false);
  });

  test("returns HTML content-type", () => {
    const route = createStatsRoute(
      makeStubSessionStats(),
      makeStubDailyTokens(),
      makeStubRepos(),
      makeStubMaintenance(),
    );
    const req = new Request("http://localhost/api/stats");
    const res = route.handle(req, new URL(req.url));
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  test("calls maintenance on each request", () => {
    let aggregateCalled = false;
    let gcCalled = false;
    const maintenance = makeStubMaintenance();
    maintenance.maybeAggregate = () => {
      aggregateCalled = true;
    };
    maintenance.maybeGC = () => {
      gcCalled = true;
    };

    const route = createStatsRoute(
      makeStubSessionStats(),
      makeStubDailyTokens(),
      makeStubRepos(),
      maintenance,
    );
    const req = new Request("http://localhost/api/stats");
    route.handle(req, new URL(req.url));
    expect(aggregateCalled).toBe(true);
    expect(gcCalled).toBe(true);
  });

  test("returns error HTML on DB failure", () => {
    const sessionStats: SessionStatsService = {
      getSessionStats: () => {
        throw new Error("DB error");
      },
      getDistinctDirectories: () => {
        throw new Error("DB error");
      },
    };
    const route = createStatsRoute(
      sessionStats,
      makeStubDailyTokens(),
      makeStubRepos(),
      makeStubMaintenance(),
    );
    const req = new Request("http://localhost/api/stats");
    const res = route.handle(req, new URL(req.url));
    expect(res.status).toBe(200);
  });
});

describe("PageRoute", () => {
  test("matches any URL (catch-all)", () => {
    const route = createPageRoute(
      makeStubSessionStats(),
      makeStubDailyTokens(),
      makeStubRepos(),
    );
    expect(route.match(new URL("http://localhost/"))).toBe(true);
    expect(route.match(new URL("http://localhost/anything"))).toBe(true);
  });

  test("returns full HTML with doctype", async () => {
    const route = createPageRoute(
      makeStubSessionStats(),
      makeStubDailyTokens(),
      makeStubRepos(),
    );
    const req = new Request("http://localhost/");
    const res = route.handle(req, new URL(req.url));
    const body = await res.text();
    expect(body).toMatch(/^<!DOCTYPE html>/);
  });

  test("returns 500 on DB failure", () => {
    const sessionStats: SessionStatsService = {
      getSessionStats: () => {
        throw new Error("DB error");
      },
      getDistinctDirectories: () => {
        throw new Error("DB error");
      },
    };
    const route = createPageRoute(
      sessionStats,
      makeStubDailyTokens(),
      makeStubRepos(),
    );
    const req = new Request("http://localhost/");
    const res = route.handle(req, new URL(req.url));
    expect(res.status).toBe(500);
  });

  test("passes directory filter from query string", async () => {
    let receivedDir: string | undefined;
    const sessionStats: SessionStatsService = {
      getSessionStats: (dir) => {
        receivedDir = dir;
        return [];
      },
      getDistinctDirectories: () => ["/proj/a", "/proj/b"],
    };
    const route = createPageRoute(
      sessionStats,
      makeStubDailyTokens(),
      makeStubRepos(),
    );
    const req = new Request("http://localhost/?dir=/proj/a");
    const res = route.handle(req, new URL(req.url));
    const body = await res.text();
    expect(receivedDir).toBe("/proj/a");
    expect(body).toContain("selected");
  });
});

describe("DirectoriesRoute", () => {
  test("matches /api/directories", () => {
    const route = createDirectoriesRoute(makeStubSessionStats());
    expect(route.match(new URL("http://localhost/api/directories"))).toBe(true);
    expect(route.match(new URL("http://localhost/"))).toBe(false);
  });

  test("returns JSON array of directories", async () => {
    const sessionStats: SessionStatsService = {
      getSessionStats: () => [],
      getDistinctDirectories: () => ["/proj/a", "/proj/b"],
    };
    const route = createDirectoriesRoute(sessionStats);
    const req = new Request("http://localhost/api/directories");
    const res = route.handle(req, new URL(req.url));
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = await res.json();
    expect(body).toEqual(["/proj/a", "/proj/b"]);
  });

  test("returns empty array on error", async () => {
    const sessionStats: SessionStatsService = {
      getSessionStats: () => [],
      getDistinctDirectories: () => {
        throw new Error("DB error");
      },
    };
    const route = createDirectoriesRoute(sessionStats);
    const req = new Request("http://localhost/api/directories");
    const res = route.handle(req, new URL(req.url));
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
