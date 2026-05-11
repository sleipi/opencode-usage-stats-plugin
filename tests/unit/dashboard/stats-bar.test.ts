import { describe, expect, test } from "bun:test";
import { renderStatsBar } from "../../../src/dashboard/templates/stats-bar";

describe("renderStatsBar", () => {
  test("renders all summary values", () => {
    const html = renderStatsBar({
      today: 1500,
      thisWeek: 10000,
      thisMonth: 50000,
      lastMonth: 120000,
    });
    expect(html).toContain("1.5k");
    expect(html).toContain("10k");
    expect(html).toContain("50k");
    expect(html).toContain("120k");
    expect(html).toContain("Overall");
  });

  test("renders zero values", () => {
    const html = renderStatsBar({
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      lastMonth: 0,
    });
    expect(html).toContain("stats-value");
  });
});
