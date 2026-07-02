import { Database } from "bun:sqlite";
import { SqliteBudgetRepo } from "./budget/sqlite-budget-repo";
import { SqliteDailyUsageRepo } from "./daily-usage/sqlite-daily-usage-repo";
import { SqliteMessageRepo } from "./message/sqlite-message-repo";
import { getSchemaVersion, migrate } from "./migrations";
import type { Repos } from "./repos";
import { SqliteSessionRepo } from "./session/sqlite-session-repo";
import { SqliteToolCallRepo } from "./tool-call/sqlite-tool-call-repo";

function setupConnection(db: Database, readonly: boolean): void {
  db.run("PRAGMA busy_timeout = 3000");
  if (!readonly) {
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA synchronous = NORMAL");
  }
  db.run("PRAGMA mmap_size = 268435456"); // 256MB; OS only maps pages actually read
  db.run("PRAGMA cache_size = -8000"); // 8MB page cache
}

function assertReadableVersion(db: Database): void {
  const row = db.prepare("PRAGMA user_version").get() as {
    user_version?: number;
  };
  const currentVersion = Number(row?.user_version ?? 0);
  if (currentVersion > getSchemaVersion()) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported ${getSchemaVersion()}. Please update this plugin/dashboard version.`,
    );
  }
}

export function createSqliteRepos(
  dbPath: string,
  opts?: { readonly?: boolean },
): Repos {
  const readonly = opts?.readonly === true;
  const db = new Database(dbPath, readonly ? { readonly: true } : undefined);
  setupConnection(db, readonly);

  if (readonly) {
    assertReadableVersion(db);
  } else {
    migrate(db);
  }

  return {
    sessions: new SqliteSessionRepo(db),
    messages: new SqliteMessageRepo(db),
    toolCalls: new SqliteToolCallRepo(db),
    dailyUsage: new SqliteDailyUsageRepo(db),
    budget: new SqliteBudgetRepo(db),
    vacuum(): void {
      db.run("VACUUM");
    },
    close(): void {
      db.close();
    },
  };
}

export function gcOldData(
  repos: Repos,
  retentionDays = 90,
): { messages: number; toolCalls: number; sessions: number } {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const deletedMessages = repos.messages.deleteOlderThan(cutoffDate);
  const deletedToolCalls = repos.toolCalls.deleteOlderThan(cutoffDate);
  const deletedSessions = repos.sessions.deleteOrphaned(cutoffDate);
  repos.vacuum();
  return {
    messages: deletedMessages,
    toolCalls: deletedToolCalls,
    sessions: deletedSessions,
  };
}
