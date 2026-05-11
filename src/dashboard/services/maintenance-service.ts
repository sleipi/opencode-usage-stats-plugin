import type { Repos } from "../../db/repos";
import type { gcOldData as GcOldDataFn } from "../../db/sqlite-repository";

export interface MaintenanceService {
  maybeAggregate(): void;
  maybeGC(): void;
  runInitial(): void;
}

export interface MaintenanceDeps {
  createWriteRepos: () => Repos;
  gcOldData: typeof GcOldDataFn;
  aggregationIntervalMs?: number;
  gcIntervalMs?: number;
  aggregationProbability?: number;
  gcProbability?: number;
  retentionDays?: number;
}

export function createMaintenanceService(
  deps: MaintenanceDeps,
): MaintenanceService {
  const aggregationIntervalMs = deps.aggregationIntervalMs ?? 60_000;
  const gcIntervalMs = deps.gcIntervalMs ?? 24 * 60 * 60 * 1000;
  const aggregationProbability = deps.aggregationProbability ?? 0.01;
  const gcProbability = deps.gcProbability ?? 0.002;
  const retentionDays = deps.retentionDays ?? 90;

  let lastAggregation = 0;
  let lastGC = 0;

  return {
    runInitial(): void {
      try {
        const repos = deps.createWriteRepos();
        const today = new Date().toISOString().slice(0, 10);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        repos.dailyUsage.recompute(sevenDaysAgo, today);
        lastAggregation = Date.now();

        deps.gcOldData(repos, retentionDays);
        lastGC = Date.now();

        repos.close();
      } catch (e) {
        console.error("Initial aggregation/GC failed:", e);
      }
    },

    maybeAggregate(): void {
      if (Math.random() >= aggregationProbability) return;
      const now = Date.now();
      if (now - lastAggregation < aggregationIntervalMs) return;
      lastAggregation = now;
      try {
        const repos = deps.createWriteRepos();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        repos.dailyUsage.recompute(sevenDaysAgo, yesterday);
        repos.close();
      } catch (e) {
        console.error("Background aggregation failed:", e);
      }
    },

    maybeGC(): void {
      if (Math.random() >= gcProbability) return;
      const now = Date.now();
      if (now - lastGC < gcIntervalMs) return;
      lastGC = now;
      try {
        const repos = deps.createWriteRepos();
        deps.gcOldData(repos, retentionDays);
        repos.close();
      } catch (e) {
        console.error("Background GC failed:", e);
      }
    },
  };
}
