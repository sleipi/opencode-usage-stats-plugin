import { describe, expect, test } from "bun:test";
import {
  MODEL_COLORS,
  renderDailyModelChart,
} from "../../../src/dashboard/templates/model-chart";

describe("renderDailyModelChart", () => {
  test("renders title", () => {
    const html = renderDailyModelChart([]);
    expect(html).toContain("Daily Token Usage by Model");
  });

  test("renders stacked segments for models", () => {
    const today = new Date().toISOString().slice(0, 10);
    const html = renderDailyModelChart([
      { date: today, model: "claude-sonnet", total: 3000 },
      { date: today, model: "gpt-4o", total: 2000 },
    ]);
    expect(html).toContain("claude-sonnet");
    expect(html).toContain("gpt-4o");
    expect(html).toContain("model-bar-seg");
  });

  test("assigns colors from MODEL_COLORS", () => {
    const today = new Date().toISOString().slice(0, 10);
    const html = renderDailyModelChart([
      { date: today, model: "model-a", total: 100 },
    ]);
    expect(html).toContain(MODEL_COLORS[0]!);
  });

  test("renders legend entries", () => {
    const today = new Date().toISOString().slice(0, 10);
    const html = renderDailyModelChart([
      { date: today, model: "test-model", total: 100 },
    ]);
    expect(html).toContain("legend-item");
    expect(html).toContain("test-model");
  });
});
