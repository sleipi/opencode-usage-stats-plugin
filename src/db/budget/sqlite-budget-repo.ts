import type { Database } from "bun:sqlite";
import type { BudgetRepo, BudgetSettings } from "./budget-repo";

export class SqliteBudgetRepo implements BudgetRepo {
  constructor(private readonly db: Database) {}

  get(): BudgetSettings | null {
    const row = this.db
      .prepare(
        "SELECT amount, work_days, period_start_day FROM budget_settings WHERE id = 1",
      )
      .get() as {
      amount: number;
      work_days: number;
      period_start_day: number;
    } | null;
    if (!row) return null;
    return {
      amount: row.amount,
      workDays: row.work_days,
      periodStartDay: row.period_start_day,
    };
  }

  upsert(settings: BudgetSettings): void {
    this.db
      .prepare(`
        INSERT INTO budget_settings (id, amount, work_days, period_start_day, updated_at)
        VALUES (1, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          amount           = excluded.amount,
          work_days        = excluded.work_days,
          period_start_day = excluded.period_start_day,
          updated_at       = excluded.updated_at
      `)
      .run(settings.amount, settings.workDays, settings.periodStartDay);
  }
}
