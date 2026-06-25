import { describe, expect, test } from "bun:test";
import {
  MODEL_COLORS,
  renderDailyModelChart,
  renderDailyModelCostChart,
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

describe("renderDailyModelCostChart", () => {
  test("renders title", () => {
    const html = renderDailyModelCostChart([]);
    expect(html).toContain("Daily Cost by Model (last 60 days)");
  });

  test("renders stacked segments for models", () => {
    const today = new Date().toISOString().slice(0, 10);
    const html = renderDailyModelCostChart([
      { date: today, model: "claude-sonnet", total: 0.5 },
      { date: today, model: "gpt-4o", total: 0.3 },
    ]);
    expect(html).toContain("claude-sonnet");
    expect(html).toContain("gpt-4o");
    expect(html).toContain("model-bar-seg");
  });

  test("uses fmtCost in tooltips", () => {
    const today = new Date().toISOString().slice(0, 10);
    const html = renderDailyModelCostChart([
      { date: today, model: "test-model", total: 0.05 },
    ]);
    expect(html).toContain("$0.05");
  });

  test("assigns colors from MODEL_COLORS", () => {
    const today = new Date().toISOString().slice(0, 10);
    const html = renderDailyModelCostChart([
      { date: today, model: "model-a", total: 0.1 },
    ]);
    expect(html).toContain(MODEL_COLORS[0]!);
  });

  test("renders legend entries", () => {
    const today = new Date().toISOString().slice(0, 10);
    const html = renderDailyModelCostChart([
      { date: today, model: "test-model", total: 0.1 },
    ]);
    expect(html).toContain("legend-item");
    expect(html).toContain("test-model");
  });
});
