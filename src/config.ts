import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface UsageStatsConfig {
  /** Enable the dashboard web server on plugin startup (default: true) */
  dashboardEnabled: boolean;
  /** Port for the dashboard web server (default: 3333) */
  dashboardPort: number;
}

const DEFAULTS: UsageStatsConfig = {
  dashboardEnabled: true,
  dashboardPort: 3333,
};

const CONFIG_DIR = join(process.env.HOME || "~", ".config", "opencode");
const CONFIG_CANDIDATES = [
  join(CONFIG_DIR, "usage-stats.jsonc"),
  join(CONFIG_DIR, "usage-stats.json"),
];

function stripJsoncComments(text: string): string {
  return text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

export function loadConfig(): UsageStatsConfig {
  for (const path of CONFIG_CANDIDATES) {
    if (!existsSync(path)) continue;

    try {
      const raw = readFileSync(path, "utf-8");
      const parsed = JSON.parse(stripJsoncComments(raw));
      return {
        dashboardEnabled:
          typeof parsed.dashboardEnabled === "boolean"
            ? parsed.dashboardEnabled
            : DEFAULTS.dashboardEnabled,
        dashboardPort:
          typeof parsed.dashboardPort === "number"
            ? parsed.dashboardPort
            : DEFAULTS.dashboardPort,
      };
    } catch {
      // Malformed config — fall through to defaults
    }
  }

  // Environment variable overrides (backward compat)
  return {
    dashboardEnabled: process.env.OPENCODE_USAGE_STATS_DASHBOARD !== "false",
    dashboardPort: process.env.OPENCODE_USAGE_STATS_PORT
      ? parseInt(process.env.OPENCODE_USAGE_STATS_PORT, 10)
      : DEFAULTS.dashboardPort,
  };
}
