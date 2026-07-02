import type { Repos } from "../../db/repos";
import { calcBudgetStatus } from "../services/budget-service";
import type { DailyTokensService } from "../services/daily-tokens-service";
import type { SessionStatsService } from "../services/session-stats-service";
import { renderHTML } from "../templates/page-template";
import type { RouteHandler } from "./route-handler";

export function createPageRoute(
  sessionStats: SessionStatsService,
  dailyTokens: DailyTokensService,
  repos: Repos,
): RouteHandler {
  return {
    match(_url: URL): boolean {
      return true;
    },

    handle(_req: Request, url: URL): Response {
      try {
        const dirFilter = url.searchParams.get("dir") || undefined;
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
        return new Response(
          renderHTML(
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
          ),
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          },
        );
      } catch (e) {
        return new Response(`DB error: ${e}`, { status: 500 });
      }
    },
  };
}
