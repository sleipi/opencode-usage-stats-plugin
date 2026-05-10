import { join } from "node:path";
import type { Repos } from "../db/repos";
import { createSqliteRepos, gcOldData } from "../db/sqlite-repository";
import { createPageRoute } from "./routes/page-route";
import { createStatsRoute } from "./routes/stats-route";
import { isPortInUse, startServer } from "./server";
import { createDailyTokensService } from "./services/daily-tokens-service";
import { createMaintenanceService } from "./services/maintenance-service";
import { createSessionStatsService } from "./services/session-stats-service";

export interface DashboardDeps {
  createReadRepos: (dbPath: string) => Repos;
  createWriteRepos: (dbPath: string) => Repos;
  gcOldData: typeof gcOldData;
}

export function createDashboard(deps: DashboardDeps) {
  return {
    async start(port: number, dbPath: string): Promise<void> {
      const portBusy = await isPortInUse(port);
      if (portBusy) {
        console.log(`Dashboard already running on port ${port}, skipping.`);
        return;
      }

      const maintenance = createMaintenanceService({
        createWriteRepos: () => deps.createWriteRepos(dbPath),
        gcOldData: deps.gcOldData,
      });
      maintenance.runInitial();

      const readRepos = deps.createReadRepos(dbPath);
      const sessionStats = createSessionStatsService(readRepos);
      const dailyTokens = createDailyTokensService(readRepos);

      const routes = [
        createStatsRoute(sessionStats, dailyTokens, readRepos, maintenance),
        createPageRoute(sessionStats, dailyTokens, readRepos),
      ];

      startServer(port, routes);
    },
  };
}

const DB_PATH =
  process.env.OPENCODE_USAGE_STATS_DB ||
  join(process.env.HOME || "~", ".config", "opencode", "usage-stats.db");
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3333;

if (import.meta.main) {
  const dashboard = createDashboard({
    createReadRepos: (p) => createSqliteRepos(p, { readonly: true }),
    createWriteRepos: (p) => createSqliteRepos(p),
    gcOldData,
  });
  dashboard.start(PORT, DB_PATH);
}
