import { afterEach, describe, expect, test } from "bun:test";
import { createBudgetRoute } from "../../../src/dashboard/routes/budget-route";
import { createSqliteRepos } from "../../../src/db/sqlite-repository";
import { cleanupTempDir, createTempDbPath } from "../helpers/temp-db";

describe("BudgetRoute", () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (dir) cleanupTempDir(dir);
    }
  });

  test("match returns true only for /api/budget", () => {
    const { dir, dbPath } = createTempDbPath("budget-route-test-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);
    const route = createBudgetRoute(repos, () => createSqliteRepos(dbPath));
    expect(route.match(new URL("http://localhost/api/budget"))).toBe(true);
    expect(route.match(new URL("http://localhost/api/stats"))).toBe(false);
    repos.close();
  });

  test("GET returns 404 when no budget set", async () => {
    const { dir, dbPath } = createTempDbPath("budget-route-test-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);
    const route = createBudgetRoute(repos, () => createSqliteRepos(dbPath));
    const res = await route.handle(
      new Request("http://localhost/api/budget"),
      new URL("http://localhost/api/budget"),
    );
    expect(res.status).toBe(404);
    repos.close();
  });

  test("GET returns 200 with JSON after budget set", async () => {
    const { dir, dbPath } = createTempDbPath("budget-route-test-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);
    repos.budget.upsert({ amount: 100, workDays: 62, periodStartDay: 1 });
    const route = createBudgetRoute(repos, () => createSqliteRepos(dbPath));
    const res = await route.handle(
      new Request("http://localhost/api/budget"),
      new URL("http://localhost/api/budget"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, number>;
    expect(body.amount).toBe(100);
    expect(body.workDays).toBe(62);
    repos.close();
  });

  test("POST saves budget and returns 200", async () => {
    const { dir, dbPath } = createTempDbPath("budget-route-test-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);
    const route = createBudgetRoute(repos, () => createSqliteRepos(dbPath));
    const res = await route.handle(
      new Request("http://localhost/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 150, workDays: 62, periodStartDay: 1 }),
      }),
      new URL("http://localhost/api/budget"),
    );
    expect(res.status).toBe(200);
    expect(repos.budget.get()?.amount).toBe(150);
    repos.close();
  });

  test("POST returns 400 on invalid body", async () => {
    const { dir, dbPath } = createTempDbPath("budget-route-test-");
    cleanupDirs.push(dir);
    const repos = createSqliteRepos(dbPath);
    const route = createBudgetRoute(repos, () => createSqliteRepos(dbPath));
    const res = await route.handle(
      new Request("http://localhost/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: "not-a-number" }),
      }),
      new URL("http://localhost/api/budget"),
    );
    expect(res.status).toBe(400);
    repos.close();
  });
});
