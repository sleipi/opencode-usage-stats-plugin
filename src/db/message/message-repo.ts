import type { DailyTokens } from "../shared-types";

export interface MessageData {
  sessionId: string;
  messageId: string;
  role: string;
  modelId: string | null;
  providerId: string | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
  agent: string | null;
}

export interface ModeRow {
  session_id: string;
  agent: string;
  model_id: string | null;
  provider_id: string | null;
  message_count: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  cost: number;
}

export interface TokenSummary {
  today: number;
  thisWeek: number;
  thisMonth: number;
  lastMonth: number;
}

export interface DailyModelTokens {
  date: string;
  model: string;
  total: number;
}

export interface CostSummary {
  today: number;
  thisWeek: number;
  thisMonth: number;
  lastMonth: number;
}

export interface MessageRepo {
  upsert(data: MessageData): void;
  getModeStats(): ModeRow[];
  getTokenSummary(): TokenSummary;
  getCostSummary(): CostSummary;
  getTodayTokens(today: string): DailyTokens;
  getTodayCost(today: string): DailyTokens;
  getDailyTokensByModel(): DailyModelTokens[];
  getDailyModelCost(): DailyModelTokens[];
  deleteOlderThan(cutoffDate: string): number;
}
