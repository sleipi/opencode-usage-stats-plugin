import { describe, expect, test } from "bun:test";
import { renderHTML } from "../../../src/dashboard/templates/page-template";

describe("renderHTML", () => {
  const summary = { today: 0, thisWeek: 0, thisMonth: 0, lastMonth: 0 };
  const costSummary = { today: 0, thisWeek: 0, thisMonth: 0, lastMonth: 0 };

  test("returns full HTML document with doctype", () => {
    const html = renderHTML([], summary, costSummary, [], [], []);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  test("includes page title", () => {
    const html = renderHTML([], summary, costSummary, [], [], []);
    expect(html).toContain("<title>OpenCode Usage Stats</title>");
  });

  test("includes CSS styles", () => {
    const html = renderHTML([], summary, costSummary, [], [], []);
    expect(html).toContain("<style>");
    expect(html).toContain("session-card");
  });

  test("includes client-side refresh script", () => {
    const html = renderHTML([], summary, costSummary, [], [], []);
    expect(html).toContain("<script>");
    expect(html).toContain("setInterval(refresh, 5000)");
  });

  test("includes auto-refresh badge", () => {
    const html = renderHTML([], summary, costSummary, [], [], []);
    expect(html).toContain("auto-refresh 5s");
    expect(html).toContain("refresh-dot");
  });

  test("includes gear button in header", () => {
    const html = renderHTML([], summary, costSummary, [], [], []);
    expect(html).toContain("gear-btn");
    expect(html).toContain("budget-modal");
  });

  test("includes day toggle buttons with German labels", () => {
    const html = renderHTML([], summary, costSummary, [], [], []);
    expect(html).toContain("day-toggle");
    expect(html).toContain(">Mo<");
    expect(html).toContain(">Di<");
    expect(html).toContain(">Mi<");
    expect(html).toContain(">Do<");
    expect(html).toContain(">Fr<");
    expect(html).toContain(">Sa<");
    expect(html).toContain(">So<");
  });
});
