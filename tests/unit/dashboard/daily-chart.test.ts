import { describe, expect, test } from "bun:test";
import {
  renderDailyChart,
  renderDailyCostChart,
} from "../../../src/dashboard/templates/daily-chart";

describe("renderDailyChart", () => {
  test("renders 60 chart columns", () => {
    const html = renderDailyChart([]);
    const count = (html.match(/class="chart-col"/g) || []).length;
    expect(count).toBe(60);
  });

  test("renders title and legend", () => {
    const html = renderDailyChart([]);
    expect(html).toContain("Daily Token Usage (last 60 days)");
    expect(html).toContain("Daily tokens");
    expect(html).toContain("5-day avg");
  });

  test("renders bars for provided data", () => {
    const today = new Date().toISOString().slice(0, 10);
    const html = renderDailyChart([{ date: today, total: 5000 }]);
    expect(html).toContain("5k");
  });

  test("handles all-zero data without errors", () => {
    const html = renderDailyChart([{ date: "2025-01-01", total: 0 }]);
    expect(html).toContain("chart-container");
  });

  test("renders rolling average polyline", () => {
    const html = renderDailyChart([]);
    expect(html).toContain("polyline");
    expect(html).toContain("chart-avg-line");
  });
});

describe("renderDailyCostChart", () => {
  test("renders 60 chart columns", () => {
    const html = renderDailyCostChart([]);
    const count = (html.match(/class="chart-col"/g) || []).length;
    expect(count).toBe(60);
  });

  test("renders title and legend", () => {
    const html = renderDailyCostChart([]);
    expect(html).toContain("Daily Cost (last 60 days)");
    expect(html).toContain("Daily cost");
    expect(html).toContain("5-day avg");
  });

  test("renders cost label using fmtCost", () => {
    const today = new Date().toISOString().slice(0, 10);
    const html = renderDailyCostChart([{ date: today, total: 1.5 }]);
    expect(html).toContain("$1.50");
  });

  test("handles all-zero data without errors", () => {
    const html = renderDailyCostChart([{ date: "2025-01-01", total: 0 }]);
    expect(html).toContain("chart-container");
  });

  test("renders rolling average polyline", () => {
    const html = renderDailyCostChart([]);
    expect(html).toContain("polyline");
    expect(html).toContain("chart-avg-line");
  });
});
