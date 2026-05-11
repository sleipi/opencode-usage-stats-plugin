import type { Repos } from "../../db/repos";
import type { AgentStats, ModeStats, SessionStats } from "./types";

export interface SessionStatsService {
  getSessionStats(directory?: string): SessionStats[];
  getDistinctDirectories(): string[];
}

export function createSessionStatsService(repos: Repos): SessionStatsService {
  return {
    getDistinctDirectories(): string[] {
      return repos.sessions.getDistinctDirectories();
    },

    getSessionStats(directory?: string): SessionStats[] {
      const rootSessions = repos.sessions.getRootSessions(directory);
      const childSessions = repos.sessions.getChildSessions();
      const agentCalls = repos.toolCalls.getAgentCalls();
      const modeRows = repos.messages.getModeStats();

      const childMap = new Map<string, any[]>();
      for (const c of childSessions) {
        if (!c.parent_id) continue;
        if (!childMap.has(c.parent_id)) childMap.set(c.parent_id, []);
        childMap.get(c.parent_id)?.push(c);
      }

      const agentMap = new Map<string, Map<string, number>>();
      for (const a of agentCalls) {
        if (!agentMap.has(a.session_id)) agentMap.set(a.session_id, new Map());
        agentMap.get(a.session_id)?.set(a.agent_type, a.call_count);
      }

      const modeMap = new Map<string, ModeStats[]>();
      for (const m of modeRows) {
        if (!modeMap.has(m.session_id)) modeMap.set(m.session_id, []);
        modeMap.get(m.session_id)?.push({
          agent: m.agent,
          message_count: m.message_count,
          input_tokens: m.input_tokens,
          output_tokens: m.output_tokens,
          reasoning_tokens: m.reasoning_tokens,
          cache_read_tokens: m.cache_read_tokens,
          cost: m.cost,
          model_id: m.model_id ?? null,
          provider_id: m.provider_id ?? null,
        });
      }

      return rootSessions.map((s) => {
        const children = childMap.get(s.session_id) || [];
        const agentCallCounts = agentMap.get(s.session_id) || new Map();

        const agentDetails: AgentStats[] = [];
        const seenAgents = new Map<string, AgentStats>();

        for (const child of children) {
          const match = child.title?.match(/@(\S+)\s+subagent/);
          const agentType = match?.[1] ?? "subagent";

          if (seenAgents.has(agentType)) {
            const existing = seenAgents.get(agentType)!;
            existing.call_count += 1;
            existing.input_tokens += child.input_tokens;
            existing.output_tokens += child.output_tokens;
            existing.reasoning_tokens += child.reasoning_tokens;
            existing.cache_read_tokens += child.cache_read_tokens;
          } else {
            const stats: AgentStats = {
              agent_type: agentType,
              call_count: 1,
              input_tokens: child.input_tokens,
              output_tokens: child.output_tokens,
              reasoning_tokens: child.reasoning_tokens,
              cache_read_tokens: child.cache_read_tokens,
              model_id: child.model_id,
              provider_id: child.provider_id,
            };
            seenAgents.set(agentType, stats);
            agentDetails.push(stats);
          }
        }

        for (const agent of agentDetails) {
          const count = agentCallCounts.get(agent.agent_type);
          if (count) agent.call_count = count;
        }

        for (const [agentType, count] of agentCallCounts) {
          if (!seenAgents.has(agentType)) {
            agentDetails.push({
              agent_type: agentType,
              call_count: count,
              input_tokens: 0,
              output_tokens: 0,
              reasoning_tokens: 0,
              cache_read_tokens: 0,
              model_id: null,
              provider_id: null,
            });
          }
        }

        const childIn = agentDetails.reduce(
          (sum, a) => sum + a.input_tokens,
          0,
        );
        const childOut = agentDetails.reduce(
          (sum, a) => sum + a.output_tokens,
          0,
        );
        const childReasoning = agentDetails.reduce(
          (sum, a) => sum + a.reasoning_tokens,
          0,
        );
        const childCache = agentDetails.reduce(
          (sum, a) => sum + a.cache_read_tokens,
          0,
        );

        return {
          session_id: s.session_id,
          title: s.title,
          directory: s.directory,
          first_seen: s.first_seen,
          last_seen: s.last_seen,
          input_tokens: s.input_tokens + childIn,
          output_tokens: s.output_tokens + childOut,
          reasoning_tokens: s.reasoning_tokens + childReasoning,
          cache_read_tokens: s.cache_read_tokens + childCache,
          cache_write_tokens: s.cache_write_tokens,
          cost: s.cost,
          agents: agentDetails,
          modes: modeMap.get(s.session_id) || [],
        };
      });
    },
  };
}
