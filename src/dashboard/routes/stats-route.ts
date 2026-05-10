import type { Repos } from "../../db/repos";
import type { DailyTokensService } from "../services/daily-tokens-service";
import type { MaintenanceService } from "../services/maintenance-service";
import type { SessionStatsService } from "../services/session-stats-service";
import { renderSessionsFragment } from "../templates/sessions-fragment";
import type { RouteHandler } from "./route-handler";

export function createStatsRoute(
  sessionStats: SessionStatsService,
  dailyTokens: DailyTokensService,
  repos: Repos,
  maintenance: MaintenanceService,
): RouteHandler {
  return {
    match(url: URL): boolean {
      return url.pathname === "/api/stats";
    },

    handle(_req: Request, _url: URL): Response {
      maintenance.maybeAggregate();
      maintenance.maybeGC();

      try {
        const sessions = sessionStats.getSessionStats();
        const summary = dailyTokens.getTokenSummary();
        const daily = dailyTokens.getDailyTokens();
        const dailyModel = dailyTokens.getDailyTokensByModel();
        const toolGroups = repos.toolCalls.getToolUsageSummary();
        return new Response(
          renderSessionsFragment(
            sessions,
            summary,
            daily,
            dailyModel,
            toolGroups,
          ),
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          },
        );
      } catch (e) {
        return new Response(`<div class="empty">DB error: ${e}</div>`, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    },
  };
}
