import { describe, expect, test } from "bun:test";
import { createSessionStatsService } from "../../../src/dashboard/services/session-stats-service";
import type { Repos } from "../../../src/db/repos";

function makeStubRepos(
  overrides: Partial<{
    rootSessions: any[];
    childSessions: any[];
    agentCalls: any[];
    modeStats: any[];
  }> = {},
): Repos {
  return {
    sessions: {
      getRootSessions: () => overrides.rootSessions ?? [],
      getChildSessions: () => overrides.childSessions ?? [],
      getDistinctDirectories: () => [],
      upsert: () => {},
      upsertFull: () => {},
      deleteOrphaned: () => 0,
    },
    messages: {
      getModeStats: () => overrides.modeStats ?? [],
      getTokenSummary: () => ({
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
        lastMonth: 0,
      }),
      getTodayTokens: () => ({ date: "2025-01-01", total: 0 }),
      getDailyTokensByModel: () => [],
      upsert: () => {},
      deleteOlderThan: () => 0,
      getCostSummary: () => ({
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
        lastMonth: 0,
      }),
    },
    toolCalls: {
      getAgentCalls: () => overrides.agentCalls ?? [],
      getToolUsageSummary: () => [],
      insert: () => {},
      deleteOlderThan: () => 0,
    },
    dailyUsage: {
      recompute: () => {},
      getHistoryUntil: () => [],
    },
    vacuum: () => {},
    close: () => {},
  };
}

describe("SessionStatsService", () => {
  test("returns empty array when no sessions exist", () => {
    const service = createSessionStatsService(makeStubRepos());
    expect(service.getSessionStats()).toEqual([]);
  });

  test("returns root sessions with token totals", () => {
    const service = createSessionStatsService(
      makeStubRepos({
        rootSessions: [
          {
            session_id: "s1",
            title: "Test",
            directory: "/tmp",
            first_seen: "2025-01-01",
            last_seen: "2025-01-01",
            input_tokens: 100,
            output_tokens: 50,
            reasoning_tokens: 10,
            cache_read_tokens: 20,
            cache_write_tokens: 5,
            cost: 0.01,
          },
        ],
      }),
    );
    const stats = service.getSessionStats();
    expect(stats).toHaveLength(1);
    expect(stats[0]!.input_tokens).toBe(100);
    expect(stats[0]!.output_tokens).toBe(50);
  });

  test("aggregates child tokens into parent session", () => {
    const service = createSessionStatsService(
      makeStubRepos({
        rootSessions: [
          {
            session_id: "parent",
            title: "Parent",
            directory: null,
            first_seen: "2025-01-01",
            last_seen: "2025-01-01",
            input_tokens: 100,
            output_tokens: 50,
            reasoning_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            cost: 0,
          },
        ],
        childSessions: [
          {
            session_id: "child1",
            parent_id: "parent",
            title: "Task (@software-architect subagent)",
            input_tokens: 200,
            output_tokens: 100,
            reasoning_tokens: 50,
            cache_read_tokens: 30,
            model_id: "claude-sonnet",
            provider_id: "anthropic",
          },
        ],
      }),
    );
    const stats = service.getSessionStats();
    expect(stats[0]!.input_tokens).toBe(300);
    expect(stats[0]!.output_tokens).toBe(150);
    expect(stats[0]!.agents).toHaveLength(1);
    expect(stats[0]!.agents[0]!.agent_type).toBe("software-architect");
  });

  test("parses agent type from child title pattern", () => {
    const service = createSessionStatsService(
      makeStubRepos({
        rootSessions: [
          {
            session_id: "p1",
            title: "X",
            directory: null,
            first_seen: "2025-01-01",
            last_seen: "2025-01-01",
            input_tokens: 0,
            output_tokens: 0,
            reasoning_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            cost: 0,
          },
        ],
        childSessions: [
          {
            session_id: "c1",
            parent_id: "p1",
            title: "PM says yes (@product-manager subagent)",
            input_tokens: 10,
            output_tokens: 5,
            reasoning_tokens: 0,
            cache_read_tokens: 0,
            model_id: null,
            provider_id: null,
          },
        ],
      }),
    );
    const agents = service.getSessionStats()[0]!.agents;
    expect(agents[0]!.agent_type).toBe("product-manager");
  });

  test("defaults to 'subagent' when title has no agent pattern", () => {
    const service = createSessionStatsService(
      makeStubRepos({
        rootSessions: [
          {
            session_id: "p1",
            title: "X",
            directory: null,
            first_seen: "2025-01-01",
            last_seen: "2025-01-01",
            input_tokens: 0,
            output_tokens: 0,
            reasoning_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            cost: 0,
          },
        ],
        childSessions: [
          {
            session_id: "c1",
            parent_id: "p1",
            title: "Some task",
            input_tokens: 10,
            output_tokens: 5,
            reasoning_tokens: 0,
            cache_read_tokens: 0,
            model_id: null,
            provider_id: null,
          },
        ],
      }),
    );
    expect(service.getSessionStats()[0]!.agents[0]!.agent_type).toBe(
      "subagent",
    );
  });

  test("merges multiple children of same agent type", () => {
    const service = createSessionStatsService(
      makeStubRepos({
        rootSessions: [
          {
            session_id: "p1",
            title: "X",
            directory: null,
            first_seen: "2025-01-01",
            last_seen: "2025-01-01",
            input_tokens: 0,
            output_tokens: 0,
            reasoning_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            cost: 0,
          },
        ],
        childSessions: [
          {
            session_id: "c1",
            parent_id: "p1",
            title: "(@explore subagent)",
            input_tokens: 10,
            output_tokens: 5,
            reasoning_tokens: 0,
            cache_read_tokens: 0,
            model_id: null,
            provider_id: null,
          },
          {
            session_id: "c2",
            parent_id: "p1",
            title: "(@explore subagent)",
            input_tokens: 20,
            output_tokens: 10,
            reasoning_tokens: 0,
            cache_read_tokens: 0,
            model_id: null,
            provider_id: null,
          },
        ],
      }),
    );
    const agents = service.getSessionStats()[0]!.agents;
    expect(agents).toHaveLength(1);
    expect(agents[0]!.call_count).toBe(2);
    expect(agents[0]!.input_tokens).toBe(30);
  });

  test("adds agents from tool_calls with no child sessions", () => {
    const service = createSessionStatsService(
      makeStubRepos({
        rootSessions: [
          {
            session_id: "p1",
            title: "X",
            directory: null,
            first_seen: "2025-01-01",
            last_seen: "2025-01-01",
            input_tokens: 0,
            output_tokens: 0,
            reasoning_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            cost: 0,
          },
        ],
        agentCalls: [
          { session_id: "p1", agent_type: "general", call_count: 3 },
        ],
      }),
    );
    const agents = service.getSessionStats()[0]!.agents;
    expect(agents).toHaveLength(1);
    expect(agents[0]!.agent_type).toBe("general");
    expect(agents[0]!.call_count).toBe(3);
    expect(agents[0]!.input_tokens).toBe(0);
  });

  test("includes mode stats for sessions", () => {
    const service = createSessionStatsService(
      makeStubRepos({
        rootSessions: [
          {
            session_id: "p1",
            title: "X",
            directory: null,
            first_seen: "2025-01-01",
            last_seen: "2025-01-01",
            input_tokens: 0,
            output_tokens: 0,
            reasoning_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            cost: 0,
          },
        ],
        modeStats: [
          {
            session_id: "p1",
            agent: "build",
            model_id: "claude-sonnet",
            provider_id: "anthropic",
            message_count: 5,
            input_tokens: 100,
            output_tokens: 50,
            reasoning_tokens: 0,
            cache_read_tokens: 10,
            cost: 0.01,
          },
        ],
      }),
    );
    const modes = service.getSessionStats()[0]!.modes;
    expect(modes).toHaveLength(1);
    expect(modes[0]!.agent).toBe("build");
    expect(modes[0]!.message_count).toBe(5);
  });
});
