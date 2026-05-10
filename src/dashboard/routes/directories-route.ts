import type { SessionStatsService } from "../services/session-stats-service";
import type { RouteHandler } from "./route-handler";

export function createDirectoriesRoute(
  sessionStats: SessionStatsService,
): RouteHandler {
  return {
    match(url: URL): boolean {
      return url.pathname === "/api/directories";
    },

    handle(_req: Request, _url: URL): Response {
      try {
        const dirs = sessionStats.getDistinctDirectories();
        return new Response(JSON.stringify(dirs), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      } catch {
        return new Response("[]", {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
    },
  };
}
