import type { SessionContext } from "../context/session-context"
import type { ChatParamsInput, HookHandler } from "./types"

export function createChatParamsHandler(context: SessionContext): HookHandler<ChatParamsInput> {
  return async (input): Promise<void> => {
    context.setAgent(input.sessionID, input.agent)
    context.setModel(input.sessionID, input.modelID ?? null, input.providerID ?? null)
  }
}
