import type { DailyUsageRepo } from "./daily-usage/daily-usage-repo";
import type { MessageRepo } from "./message/message-repo";
import type { SessionRepo } from "./session/session-repo";
import type { ToolCallRepo } from "./tool-call/tool-call-repo";

export interface Repos {
  sessions: SessionRepo;
  messages: MessageRepo;
  toolCalls: ToolCallRepo;
  dailyUsage: DailyUsageRepo;
  vacuum(): void;
  close(): void;
}
