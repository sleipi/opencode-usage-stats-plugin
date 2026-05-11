#!/usr/bin/env bun
/**
 * OpenCode Usage Stats Dashboard
 *
 * This file is a thin shim for backward compatibility (symlink target).
 * All logic lives in src/dashboard/.
 */
export {
  esc,
  fmtCompact,
  renderTokens,
} from "./dashboard/templates/formatters";

if (import.meta.main) {
  const { createDashboard } = await import("./dashboard/index");
  const { createSqliteRepos, gcOldData } = await import(
    "./db/sqlite-repository"
  );
  const { join } = await import("node:path");

  const DB_PATH =
    process.env.OPENCODE_USAGE_STATS_DB ||
    join(process.env.HOME || "~", ".config", "opencode", "usage-stats.db");
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3333;

  const dashboard = createDashboard({
    createReadRepos: (p) => createSqliteRepos(p, { readonly: true }),
    createWriteRepos: (p) => createSqliteRepos(p),
    gcOldData,
  });
  dashboard.start(PORT, DB_PATH);
}
