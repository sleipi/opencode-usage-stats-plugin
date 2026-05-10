export interface ToolCallData {
  sessionId: string;
  callId: string;
  toolName: string;
  agentType: string | null;
  description: string | null;
  agent: string | null;
  modelId: string | null;
  providerId: string | null;
}

export interface AgentCallRow {
  session_id: string;
  agent_type: string;
  call_count: number;
}

export interface ToolCountSummary {
  tool_name: string;
  today: number;
  thisWeek: number;
  thisMonth: number;
  lastMonth: number;
}

export interface ToolGroupSummary {
  agent: string | null;
  provider_id: string | null;
  model_id: string | null;
  latest_timestamp: string | null;
  tools: ToolCountSummary[];
}

export interface ToolCallRepo {
  insert(data: ToolCallData): void;
  getAgentCalls(): AgentCallRow[];
  getToolUsageSummary(): ToolGroupSummary[];
  deleteOlderThan(cutoffDate: string): number;
}
