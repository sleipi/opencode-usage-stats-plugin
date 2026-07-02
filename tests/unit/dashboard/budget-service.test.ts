import { describe, expect, test } from "bun:test";
import { calcBudgetStatus } from "../../../src/dashboard/services/budget-service";

// July 2026: 31 days. July 1 = Wednesday.
// Mon-Fri work days in July: 1,2,3,6,7,8,9,10,13,14,15,16,17,20,21,22,23,24,27,28,29,30,31 = 23 days
const MON_FRI = 62; // 0b0111110

describe("calcBudgetStatus", () => {
  test("no elapsed work days at period start (day 1)", () => {
    // July 1 = day 0 elapsed (today is the first day, elapsed = days before today)
    const status = calcBudgetStatus(
      { amount: 100, workDays: MON_FRI, periodStartDay: 1 },
      0,
      new Date(2026, 6, 1), // July 1, 2026
    );
    expect(status.workDaysElapsed).toBe(0);
    expect(status.expected).toBe(0);
    expect(status.delta).toBe(0);
    expect(status.workDaysTotal).toBe(23);
  });

  test("prorates correctly mid-month", () => {
    // July 3 (Friday): elapsed = Jul 1 (Wed) + Jul 2 (Thu) = 2 work days
    const status = calcBudgetStatus(
      { amount: 100, workDays: MON_FRI, periodStartDay: 1 },
      6,
      new Date(2026, 6, 3), // July 3
    );
    expect(status.workDaysElapsed).toBe(2);
    expect(status.workDaysTotal).toBe(23);
    expect(status.expected).toBeCloseTo(100 * (2 / 23), 5);
    // spent 6, expected ~8.70 → ahead (delta negative)
    expect(status.delta).toBeCloseTo(6 - 100 * (2 / 23), 5);
  });

  test("delta positive when over budget pace", () => {
    // July 3: expected ~8.70, spent 20 → delta > 0
    const status = calcBudgetStatus(
      { amount: 100, workDays: MON_FRI, periodStartDay: 1 },
      20,
      new Date(2026, 6, 3),
    );
    expect(status.delta).toBeGreaterThan(0);
  });

  test("remaining clamps to 0 pct when overspent", () => {
    const status = calcBudgetStatus(
      { amount: 100, workDays: MON_FRI, periodStartDay: 1 },
      150,
      new Date(2026, 6, 15),
    );
    expect(status.remaining).toBe(-50);
    expect(status.remainingPct).toBe(0);
  });

  test("remainingPct is 100 when nothing spent", () => {
    const status = calcBudgetStatus(
      { amount: 100, workDays: MON_FRI, periodStartDay: 1 },
      0,
      new Date(2026, 6, 1),
    );
    expect(status.remainingPct).toBe(100);
  });

  test("resetDate is first day of next month", () => {
    const status = calcBudgetStatus(
      { amount: 100, workDays: MON_FRI, periodStartDay: 1 },
      50,
      new Date(2026, 6, 15),
    );
    expect(status.resetDate.getFullYear()).toBe(2026);
    expect(status.resetDate.getMonth()).toBe(7); // August = index 7
    expect(status.resetDate.getDate()).toBe(1);
  });

  test("weekend-only work days", () => {
    // bit0=Sun=1, bit6=Sat=64 → 65
    // July 6 (Monday): elapsed days before today = Jul 1-5
    // Jul 4=Sat✓, Jul 5=Sun✓ → 2 elapsed weekend days
    const status = calcBudgetStatus(
      { amount: 100, workDays: 65, periodStartDay: 1 },
      10,
      new Date(2026, 6, 6),
    );
    expect(status.workDaysElapsed).toBe(2);
  });

  test("workDaysTotal is 0 when all days disabled", () => {
    const status = calcBudgetStatus(
      { amount: 100, workDays: 0, periodStartDay: 1 },
      0,
      new Date(2026, 6, 15),
    );
    expect(status.workDaysTotal).toBe(0);
    expect(status.expected).toBe(0);
  });

  test("periodStartDay after today counts 0 elapsed", () => {
    // Period starts July 20, today is July 15
    const status = calcBudgetStatus(
      { amount: 100, workDays: MON_FRI, periodStartDay: 20 },
      0,
      new Date(2026, 6, 15),
    );
    expect(status.workDaysElapsed).toBe(0);
  });
});
