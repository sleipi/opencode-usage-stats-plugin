import { join } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import { loadConfig } from "./config";
import { SessionContext } from "./context/session-context";
import { createDashboard } from "./dashboard/index";
import type { Repos } from "./db/repos";
import { createSqliteRepos, gcOldData } from "./db/sqlite-repository";
import { createChatParamsHandler } from "./handlers/chat-params";
import { createEventHandler } from "./handlers/event";
import { createToolExecuteAfterHandler } from "./handlers/tool-execute";

const DB_PATH =
  process.env.OPENCODE_USAGE_STATS_DB ||
  join(process.env.HOME || "~", ".config", "opencode", "usage-stats.db");

interface UsageStatsPluginDeps {
  createRepos: (dbPath: string) => Repos;
}

function createUsageStatsPlugin(deps: UsageStatsPluginDeps): Plugin {
  return async (ctx) => {
    const repos = deps.createRepos(DB_PATH);
    const config = loadConfig();

    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    repos.dailyUsage.recompute(sevenDaysAgo, today);

    if (config.dashboardEnabled) {
      const dashboard = createDashboard({
        createReadRepos: (p) => createSqliteRepos(p, { readonly: true }),
        createWriteRepos: (p) => createSqliteRepos(p),
        gcOldData,
      });
      dashboard.start(config.dashboardPort, DB_PATH).catch(() => {
        // Silently ignore dashboard start failures to not break the plugin
      });
    }

    const context = new SessionContext(ctx.project?.id ?? null);
    const chatParamsHandler = createChatParamsHandler(context);
    const toolExecuteAfterHandler = createToolExecuteAfterHandler(
      context,
      repos,
    );
    const eventHandler = createEventHandler(context, repos);

    return {
      "chat.params": chatParamsHandler,
      "tool.execute.after": toolExecuteAfterHandler,
      event: eventHandler,
    };
  };
}

export const UsageStatsPlugin: Plugin = createUsageStatsPlugin({
  createRepos: (dbPath) => createSqliteRepos(dbPath),
});
