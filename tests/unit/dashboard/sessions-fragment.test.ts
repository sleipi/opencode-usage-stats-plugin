import { describe, expect, test } from "bun:test";
import type { SessionStats } from "../../../src/dashboard/services/types";
import { renderSessionsFragment } from "../../../src/dashboard/templates/sessions-fragment";

describe("renderSessionsFragment", () => {
  const summary = {
    today: 100,
    thisWeek: 500,
    thisMonth: 2000,
    lastMonth: 1500,
  };

  test("renders empty state when no sessions", () => {
    const html = renderSessionsFragment([], summary, [], [], []);
    expect(html).toContain("No sessions recorded yet.");
  });

  test("renders two-column layout", () => {
    const html = renderSessionsFragment([], summary, [], [], []);
    expect(html).toContain("two-col");
    expect(html).toContain("left-panel");
    expect(html).toContain("right-panel");
  });

  test("renders session cards for provided sessions", () => {
    const sessions: SessionStats[] = [
      {
        session_id: "s1",
        title: "My Session",
        directory: "/tmp",
        first_seen: "2025-01-01",
        last_seen: "2025-01-01",
        input_tokens: 100,
        output_tokens: 50,
        reasoning_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        cost: 0,
        agents: [],
        modes: [],
      },
    ];
    const html = renderSessionsFragment(sessions, summary, [], [], []);
    expect(html).toContain("My Session");
    expect(html).toContain("session-card");
  });

  test("renders directory filter dropdown", () => {
    const html = renderSessionsFragment(
      [],
      summary,
      [],
      [],
      [],
      ["/proj/a", "/proj/b"],
    );
    expect(html).toContain("dir-filter");
    expect(html).toContain("/proj/a");
    expect(html).toContain("/proj/b");
    expect(html).toContain("All directories");
  });

  test("marks selected directory in dropdown", () => {
    const html = renderSessionsFragment(
      [],
      summary,
      [],
      [],
      [],
      ["/proj/a", "/proj/b"],
      "/proj/b",
    );
    expect(html).toContain('value="/proj/b" selected');
  });
});
