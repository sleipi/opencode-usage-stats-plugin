export interface SessionUpsertData {
  sessionId: string
  projectId: string | null
}

export interface SessionFullData {
  sessionId: string
  projectId: string | null
  parentId: string | null
  title: string | null
  directory: string | null
}

export interface MessageData {
  sessionId: string
  messageId: string
  role: string
  modelId: string | null
  providerId: string | null
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number
  agent: string | null
}

export interface ToolCallData {
  sessionId: string
  callId: string
  toolName: string
  agentType: string | null
  description: string | null
  agent: string | null
  modelId: string | null
  providerId: string | null
}

export interface RootSessionRow {
  session_id: string
  title: string | null
  directory: string | null
  first_seen: string
  last_seen: string
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  cost: number
}

export interface ChildSessionRow {
  session_id: string
  parent_id: string | null
  title: string | null
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cache_read_tokens: number
  model_id: string | null
  provider_id: string | null
}

export interface AgentCallRow {
  session_id: string
  agent_type: string
  call_count: number
}

export interface ModeRow {
  session_id: string
  agent: string
  model_id: string | null
  provider_id: string | null
  message_count: number
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cache_read_tokens: number
  cost: number
}

export interface TokenSummary {
  today: number
  thisWeek: number
  thisMonth: number
  lastMonth: number
}

export interface DailyTokens {
  date: string
  total: number
}

export interface DailyModelTokens {
  date: string
  model: string
  total: number
}

export interface ToolCountSummary {
  tool_name: string
  today: number
  thisWeek: number
  thisMonth: number
  lastMonth: number
}

export interface ToolGroupSummary {
  agent: string | null
  provider_id: string | null
  model_id: string | null
  latest_timestamp: string | null
  tools: ToolCountSummary[]
}

export interface SessionRepo {
  upsert(data: SessionUpsertData): void
  upsertFull(data: SessionFullData): void
  getRootSessions(): RootSessionRow[]
  getChildSessions(): ChildSessionRow[]
  deleteOrphaned(cutoffDate: string): number
}

export interface MessageRepo {
  upsert(data: MessageData): void
  getModeStats(): ModeRow[]
  getTokenSummary(): TokenSummary
  getTodayTokens(today: string): DailyTokens
  getDailyTokensByModel(): DailyModelTokens[]
  deleteOlderThan(cutoffDate: string): number
}

export interface ToolCallRepo {
  insert(data: ToolCallData): void
  getAgentCalls(): AgentCallRow[]
  getToolUsageSummary(): ToolGroupSummary[]
  deleteOlderThan(cutoffDate: string): number
}

export interface DailyUsageRepo {
  recompute(fromDay: string, toDay: string): void
  getHistoryUntil(dayExclusive: string, lookbackDays: number): DailyTokens[]
}

export interface Repos {
  sessions: SessionRepo
  messages: MessageRepo
  toolCalls: ToolCallRepo
  dailyUsage: DailyUsageRepo
  vacuum(): void
  close(): void
}
