import { describe, expect, test } from "bun:test";
import type { SessionStats } from "../../../src/dashboard/services/types";
import { renderSessionCard } from "../../../src/dashboard/templates/session-card";

function makeSession(overrides: Partial<SessionStats> = {}): SessionStats {
  return {
    session_id: "sess-1",
    title: "Test Session",
    directory: "/home/user/project",
    first_seen: "2025-01-01T00:00:00",
    last_seen: "2025-01-01T01:00:00",
    input_tokens: 1000,
    output_tokens: 500,
    reasoning_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost: 0,
    agents: [],
    modes: [],
    ...overrides,
  };
}

describe("renderSessionCard", () => {
  test("renders session title and id", () => {
    const html = renderSessionCard(makeSession());
    expect(html).toContain("Test Session");
    expect(html).toContain("sess-1");
  });

  test("falls back to directory basename when title is null", () => {
    const html = renderSessionCard(makeSession({ title: null }));
    expect(html).toContain("project");
  });

  test("falls back to session_id when title and directory are null", () => {
    const html = renderSessionCard(
      makeSession({ title: null, directory: null }),
    );
    expect(html).toContain("sess-1");
  });

  test("renders directory when present", () => {
    const html = renderSessionCard(makeSession());
    expect(html).toContain("/home/user/project");
    expect(html).toContain("session-dir");
  });

  test("omits directory span when null", () => {
    const html = renderSessionCard(makeSession({ directory: null }));
    expect(html).not.toContain("session-dir");
  });

  test("escapes XSS in title", () => {
    const html = renderSessionCard(
      makeSession({ title: '<img onerror="alert(1)">' }),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  test("renders agent rows", () => {
    const html = renderSessionCard(
      makeSession({
        agents: [
          {
            agent_type: "software-architect",
            call_count: 2,
            input_tokens: 500,
            output_tokens: 200,
            reasoning_tokens: 0,
            cache_read_tokens: 0,
            model_id: "claude-sonnet",
            provider_id: null,
          },
        ],
      }),
    );
    expect(html).toContain("software-architect");
    expect(html).toContain("2x");
    expect(html).toContain("claude-sonnet");
  });

  test("renders mode rows with cost", () => {
    const html = renderSessionCard(
      makeSession({
        modes: [
          {
            agent: "build",
            message_count: 5,
            input_tokens: 100,
            output_tokens: 50,
            reasoning_tokens: 0,
            cache_read_tokens: 0,
            cost: 0.0123,
            model_id: "claude-sonnet",
            provider_id: "anthropic",
          },
        ],
      }),
    );
    expect(html).toContain("Build");
    expect(html).toContain("5 msgs");
    expect(html).toContain("$0.0123");
    expect(html).toContain("anthropic / claude-sonnet");
  });

  test("renders session-level cost in token line", () => {
    const html = renderSessionCard(makeSession({ cost: 1.23 }));
    expect(html).toContain("$1.23");
    expect(html).toContain("mode-cost");
  });

  test("omits session-level cost when zero", () => {
    const html = renderSessionCard(makeSession({ cost: 0 }));
    const tokenLine = html.match(/<div class="session-tokens">[\s\S]*?<\/div>/);
    expect(tokenLine?.[0]).not.toContain("mode-cost");
  });

  test("adds active recency class for sessions < 5 min old", () => {
    const now = new Date();
    const lastSeen = now.toISOString().replace("T", " ").slice(0, 19);
    const html = renderSessionCard(makeSession({ last_seen: lastSeen }));
    expect(html).toContain("session-card--active");
  });

  test("adds recent recency class for sessions < 1 h old", () => {
    const seen = new Date(Date.now() - 10 * 60 * 1000);
    const lastSeen = seen.toISOString().replace("T", " ").slice(0, 19);
    const html = renderSessionCard(makeSession({ last_seen: lastSeen }));
    expect(html).toContain("session-card--recent");
    expect(html).not.toContain("session-card--active");
  });

  test("adds idle recency class for sessions < 8 h old", () => {
    const seen = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const lastSeen = seen.toISOString().replace("T", " ").slice(0, 19);
    const html = renderSessionCard(makeSession({ last_seen: lastSeen }));
    expect(html).toContain("session-card--idle");
    expect(html).not.toContain("session-card--recent");
  });

  test("adds stale recency class for sessions < 16 h old", () => {
    const seen = new Date(Date.now() - 10 * 60 * 60 * 1000);
    const lastSeen = seen.toISOString().replace("T", " ").slice(0, 19);
    const html = renderSessionCard(makeSession({ last_seen: lastSeen }));
    expect(html).toContain("session-card--stale");
    expect(html).not.toContain("session-card--idle");
  });

  test("adds old recency class for sessions < 24 h old", () => {
    const seen = new Date(Date.now() - 20 * 60 * 60 * 1000);
    const lastSeen = seen.toISOString().replace("T", " ").slice(0, 19);
    const html = renderSessionCard(makeSession({ last_seen: lastSeen }));
    expect(html).toContain("session-card--old");
    expect(html).not.toContain("session-card--stale");
  });

  test("no recency class for sessions >= 24 h old", () => {
    const html = renderSessionCard(
      makeSession({ last_seen: "2020-01-01 00:00:00" }),
    );
    expect(html).not.toContain("session-card--active");
    expect(html).not.toContain("session-card--recent");
    expect(html).not.toContain("session-card--idle");
    expect(html).not.toContain("session-card--stale");
    expect(html).not.toContain("session-card--old");
  });
});
