import type { SessionContext } from "../context/session-context";
import type { Repos } from "../db/repos";
import {
  type EventEnvelope,
  type EventHandler,
  isMessageUpdatedEvent,
  isSessionEvent,
} from "./types";

export function createEventHandler(
  context: SessionContext,
  repos: Repos,
): EventHandler {
  return async ({ event }: EventEnvelope): Promise<void> => {
    try {
      if (isSessionEvent(event)) {
        const session = event.properties?.info;
        if (session?.id) {
          repos.sessions.upsertFull({
            sessionId: session.id,
            projectId: session.projectID ?? context.getProjectId(),
            parentId: session.parentID ?? null,
            title: session.title ?? null,
            directory: session.directory ?? null,
          });
        }
        return;
      }

      if (isMessageUpdatedEvent(event)) {
        const msg = event.properties?.info;
        if (!msg || msg.role !== "assistant") return;

        repos.sessions.upsert({
          sessionId: msg.sessionID,
          projectId: context.getProjectId(),
        });

        repos.messages.upsert({
          sessionId: msg.sessionID,
          messageId: msg.id,
          role: msg.role,
          modelId: msg.modelID ?? null,
          providerId: msg.providerID ?? null,
          inputTokens: msg.tokens?.input ?? 0,
          outputTokens: msg.tokens?.output ?? 0,
          reasoningTokens: msg.tokens?.reasoning ?? 0,
          cacheReadTokens: msg.tokens?.cache?.read ?? 0,
          cacheWriteTokens: msg.tokens?.cache?.write ?? 0,
          cost: msg.cost ?? 0,
          agent: context.getAgent(msg.sessionID),
        });
      }
    } catch {
      // Ignore write errors from telemetry plugin
    }
  };
}
