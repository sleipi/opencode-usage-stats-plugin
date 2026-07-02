export interface BudgetSettings {
  amount: number;
  workDays: number;
  periodStartDay: number;
}

export interface BudgetRepo {
  get(): BudgetSettings | null;
  upsert(settings: BudgetSettings): void;
}
