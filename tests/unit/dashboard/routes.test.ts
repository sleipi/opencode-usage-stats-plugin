import { describe, expect, test } from "bun:test";
import { createDirectoriesRoute } from "../../../src/dashboard/routes/directories-route";
import { createPageRoute } from "../../../src/dashboard/routes/page-route";
import { createStatsRoute } from "../../../src/dashboard/routes/stats-route";
import type { DailyTokensService } from "../../../src/dashboard/services/daily-tokens-service";
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
    );
    expect(route.match(new URL("http://localhost/api/stats"))).toBe(true);
    expect(route.match(new URL("http://localhost/"))).toBe(false);
  });

  test("returns HTML content-type", () => {
    const route = createStatsRoute(
      makeStubSessionStats(),
      makeStubDailyTokens(),
      makeStubRepos(),
    );
    const req = new Request("http://localhost/api/stats");
    const res = route.handle(req, new URL(req.url));
    expect(res.headers.get("Content-Type")).toContain("text/html");
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
    );
    const req = new Request("http://localhost/api/stats");
    const res = route.handle(req, new URL(req.url));
    expect(res.status).toBe(200);
  });

  test("serves cached response within TTL", async () => {
    let callCount = 0;
    const sessionStats: SessionStatsService = {
      getSessionStats: () => {
        callCount++;
        return [];
      },
      getDistinctDirectories: () => [],
    };
    const route = createStatsRoute(
      sessionStats,
      makeStubDailyTokens(),
      makeStubRepos(),
    );
    const url = new URL("http://localhost/api/stats");
    const req1 = new Request(url.toString());
    const res1 = route.handle(req1, url);
    const body1 = await res1.text();

    const req2 = new Request(url.toString());
    const res2 = route.handle(req2, url);
    const body2 = await res2.text();

    expect(callCount).toBe(1);
    expect(body1).toBe(body2);
  });

  test("refreshes cache after TTL expires", async () => {
    let callCount = 0;
    const sessionStats: SessionStatsService = {
      getSessionStats: () => {
        callCount++;
        return [];
      },
      getDistinctDirectories: () => [],
    };
    const route = createStatsRoute(
      sessionStats,
      makeStubDailyTokens(),
      makeStubRepos(),
      { cacheTtlMs: 1 },
    );
    const url = new URL("http://localhost/api/stats");

    route.handle(new Request(url.toString()), url);
    expect(callCount).toBe(1);

    await new Promise((r) => setTimeout(r, 5));

    route.handle(new Request(url.toString()), url);
    expect(callCount).toBe(2);
  });

  test("caches separately per directory filter", () => {
    let lastDir: string | undefined;
    const sessionStats: SessionStatsService = {
      getSessionStats: (dir) => {
        lastDir = dir;
        return [];
      },
      getDistinctDirectories: () => [],
    };
    const route = createStatsRoute(
      sessionStats,
      makeStubDailyTokens(),
      makeStubRepos(),
    );

    const url1 = new URL("http://localhost/api/stats?dir=/a");
    route.handle(new Request(url1.toString()), url1);
    expect(lastDir).toBe("/a");

    const url2 = new URL("http://localhost/api/stats?dir=/b");
    route.handle(new Request(url2.toString()), url2);
    expect(lastDir).toBe("/b");
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
