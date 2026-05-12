import { describe, expect, test } from "bun:test";
import { renderStatsBar } from "../../../src/dashboard/templates/stats-bar";

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
