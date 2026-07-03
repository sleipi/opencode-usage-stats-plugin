import { describe, expect, test } from "bun:test";
import type { BudgetStatus } from "../../../src/dashboard/services/budget-service";
import {
  renderBudgetBar,
  renderStatsBar,
} from "../../../src/dashboard/templates/stats-bar";

function makeStatus(overrides: Partial<BudgetStatus> = {}): BudgetStatus {
  return {
    amount: 100,
    spent: 50,
    expected: 60,
    delta: -10, // 10 ahead
    remaining: 50,
    remainingPct: 50,
    resetDate: new Date(2026, 7, 1), // Aug 1
    workDaysTotal: 23,
    workDaysElapsed: 14,
    ...overrides,
  };
}

describe("renderBudgetBar", () => {
  test("returns empty string when status is null", () => {
    expect(renderBudgetBar(null)).toBe("");
  });

  test("shows ahead badge when delta negative", () => {
    const html = renderBudgetBar(makeStatus({ delta: -10, expected: 60 }));
    expect(html).toContain("budget-badge--ahead");
    expect(html).toContain("▲");
    expect(html).toContain("ahead");
  });

  test("shows over badge when delta positive beyond threshold", () => {
    const html = renderBudgetBar(makeStatus({ delta: 20, expected: 60 }));
    expect(html).toContain("budget-badge--over");
    expect(html).toContain("▼");
    expect(html).toContain("over");
  });

  test("shows on-track badge when delta within 2% of expected", () => {
    const html = renderBudgetBar(makeStatus({ delta: 0.5, expected: 60 }));
    expect(html).toContain("budget-badge--on-track");
    expect(html).toContain("on track");
  });

  test("shows remaining and reset date", () => {
    const html = renderBudgetBar(
      makeStatus({
        remaining: 50,
        remainingPct: 50,
        resetDate: new Date(2026, 7, 1),
      }),
    );
    expect(html).toContain("50%");
    expect(html).toContain("Aug");
    expect(html).toContain("1");
  });

  test("shows Budget$ label", () => {
    const html = renderBudgetBar(makeStatus());
    expect(html).toContain("Budget$");
  });
});

const zeroCost = { today: 0, thisWeek: 0, thisMonth: 0, lastMonth: 0 };

describe("renderStatsBar", () => {
  test("renders all summary values", () => {
    const html = renderStatsBar(
      { today: 1500, thisWeek: 10000, thisMonth: 50000, lastMonth: 120000 },
      zeroCost,
    );
    expect(html).toContain("1.5k");
    expect(html).toContain("10k");
    expect(html).toContain("50k");
    expect(html).toContain("120k");
    expect(html).toContain("Overall");
  });

  test("renders zero values", () => {
    const html = renderStatsBar(
      { today: 0, thisWeek: 0, thisMonth: 0, lastMonth: 0 },
      zeroCost,
    );
    expect(html).toContain("stats-value");
  });

  test("renders Overall$ cost row", () => {
    const html = renderStatsBar(
      { today: 0, thisWeek: 0, thisMonth: 0, lastMonth: 0 },
      { today: 5.54, thisWeek: 23.1, thisMonth: 67.8, lastMonth: 52.3 },
    );
    expect(html).toContain("Overall$");
    expect(html).toContain("$5.54");
    expect(html).toContain("$23.10");
    expect(html).toContain("$67.80");
    expect(html).toContain("$52.30");
    expect(html).toContain("cost-value");
  });

  test("renders sub-cent costs with 4 decimals", () => {
    const html = renderStatsBar(
      { today: 0, thisWeek: 0, thisMonth: 0, lastMonth: 0 },
      { today: 0.0042, thisWeek: 0, thisMonth: 0, lastMonth: 0 },
    );
    expect(html).toContain("$0.0042");
  });
});
