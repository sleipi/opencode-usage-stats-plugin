import { afterEach, describe, expect, test } from "bun:test";
import { createSqliteRepos } from "../../src/db/sqlite-repository";
import { cleanupTempDir, createTempDbPath } from "./helpers/temp-db";

describe("SqliteBudgetRepo", () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (dir) cleanupTempDir(dir);
    }
  });

  test("get returns null when no budget set", () => {
    const { dir, dbPath } = createTempDbPath("budget-repo-test-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);
    expect(repos.budget.get()).toBeNull();
    repos.close();
  });

  test("upsert then get returns settings", () => {
    const { dir, dbPath } = createTempDbPath("budget-repo-test-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);
    repos.budget.upsert({ amount: 100, workDays: 62, periodStartDay: 1 });
    const result = repos.budget.get();
    expect(result?.amount).toBe(100);
    expect(result?.workDays).toBe(62);
    expect(result?.periodStartDay).toBe(1);
    repos.close();
  });

  test("upsert overwrites previous settings", () => {
    const { dir, dbPath } = createTempDbPath("budget-repo-test-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);
    repos.budget.upsert({ amount: 100, workDays: 62, periodStartDay: 1 });
    repos.budget.upsert({ amount: 200, workDays: 31, periodStartDay: 15 });
    const result = repos.budget.get();
    expect(result?.amount).toBe(200);
    expect(result?.workDays).toBe(31);
    expect(result?.periodStartDay).toBe(15);
    repos.close();
  });
});
