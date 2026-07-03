import type { Repos } from "../../db/repos";
import { calcBudgetStatus } from "../services/budget-service";
import type { DailyTokensService } from "../services/daily-tokens-service";
import type { SessionStatsService } from "../services/session-stats-service";
import { renderSessionsFragment } from "../templates/sessions-fragment";
import type { RouteHandler } from "./route-handler";

interface CacheEntry {
  html: string;
  expiry: number;
}

interface StatsRouteOptions {
  cacheTtlMs?: number;
}

export function createStatsRoute(
  sessionStats: SessionStatsService,
  dailyTokens: DailyTokensService,
  repos: Repos,
  options?: StatsRouteOptions,
): RouteHandler {
  const cache = new Map<string, CacheEntry>();
  const CACHE_TTL_MS = options?.cacheTtlMs ?? 2000;

  return {
    match(url: URL): boolean {
      return url.pathname === "/api/stats";
    },

    handle(_req: Request, url: URL): Response {
      try {
        const dirFilter = url.searchParams.get("dir") || undefined;
        const cacheKey = dirFilter ?? "__all__";
        const now = Date.now();
        const cached = cache.get(cacheKey);

        if (cached && now < cached.expiry) {
          return new Response(cached.html, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        const directories = sessionStats.getDistinctDirectories();
        const sessions = sessionStats.getSessionStats(dirFilter);
        const summary = dailyTokens.getTokenSummary();
        const costSummary = dailyTokens.getCostSummary();
        const daily = dailyTokens.getDailyTokens();
        const dailyModel = dailyTokens.getDailyTokensByModel();
        const dailyCost = dailyTokens.getDailyCost();
        const dailyModelCost = dailyTokens.getDailyModelCost();
        const toolGroups = repos.toolCalls.getToolUsageSummary();
        const budgetSettings = repos.budget.get();
        const budgetStatus = budgetSettings
          ? calcBudgetStatus(budgetSettings, costSummary.thisMonth, new Date())
          : null;
        const html = renderSessionsFragment(
          sessions,
          summary,
          costSummary,
          daily,
          dailyModel,
          toolGroups,
          directories,
          dirFilter,
          dailyCost,
          dailyModelCost,
          budgetStatus,
        );

        cache.set(cacheKey, { html, expiry: now + CACHE_TTL_MS });

        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } catch (e) {
        return new Response(`<div class="empty">DB error: ${e}</div>`, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    },
  };
}
