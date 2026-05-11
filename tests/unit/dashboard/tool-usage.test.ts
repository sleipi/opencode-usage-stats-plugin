import { describe, expect, test } from "bun:test";
import { renderToolUsage } from "../../../src/dashboard/templates/tool-usage";
import type { ToolGroupSummary } from "../../../src/db/tool-call/tool-call-repo";

describe("renderToolUsage", () => {
  test("returns empty string for empty groups", () => {
    expect(renderToolUsage([])).toBe("");
  });

  test("filters out groups with null agent", () => {
    const groups: ToolGroupSummary[] = [
      {
        agent: null,
        provider_id: null,
        model_id: null,
        latest_timestamp: null,
        tools: [
          {
            tool_name: "test",
            today: 1,
            thisWeek: 1,
            thisMonth: 1,
            lastMonth: 0,
          },
        ],
      },
    ];
    const html = renderToolUsage(groups);
    expect(html).not.toContain("tool-group");
  });

  test("renders visible groups with tools", () => {
    const groups: ToolGroupSummary[] = [
      {
        agent: "build",
        provider_id: "anthropic",
        model_id: "claude-sonnet",
        latest_timestamp: "2025-01-01",
        tools: [
          {
            tool_name: "Read",
            today: 5,
            thisWeek: 20,
            thisMonth: 100,
            lastMonth: 50,
          },
          {
            tool_name: "Write",
            today: 2,
            thisWeek: 10,
            thisMonth: 40,
            lastMonth: 30,
          },
        ],
      },
    ];
    const html = renderToolUsage(groups);
    expect(html).toContain("Build");
    expect(html).toContain("anthropic / claude-sonnet");
    expect(html).toContain("Read");
    expect(html).toContain("Write");
    expect(html).toContain("Tool Usage");
  });

  test("renders data-group-key for state preservation", () => {
    const groups: ToolGroupSummary[] = [
      {
        agent: "plan",
        provider_id: "openai",
        model_id: "gpt-4o",
        latest_timestamp: null,
        tools: [
          {
            tool_name: "Search",
            today: 1,
            thisWeek: 1,
            thisMonth: 1,
            lastMonth: 0,
          },
        ],
      },
    ];
    const html = renderToolUsage(groups);
    expect(html).toContain('data-group-key="plan|openai|gpt-4o"');
  });
});
