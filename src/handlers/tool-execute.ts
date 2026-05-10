import type { SessionContext } from "../context/session-context";
import type { Repos } from "../db/repos";
import type { HookHandler, ToolExecuteAfterInput } from "./types";

export function createToolExecuteAfterHandler(
  context: SessionContext,
  repos: Repos,
): HookHandler<ToolExecuteAfterInput> {
  return async (input): Promise<void> => {
    const args = input.args;
    const agentType =
      input.tool === "task" && args?.subagent_type
        ? String(args.subagent_type)
        : null;
    const description = args?.description ? String(args.description) : null;
    const agent = context.getAgent(input.sessionID);
    const modelInfo = context.getModel(input.sessionID);

    try {
      repos.sessions.upsert({
        sessionId: input.sessionID,
        projectId: context.getProjectId(),
      });

      repos.toolCalls.insert({
        sessionId: input.sessionID,
        callId: input.callID,
        toolName: input.tool,
        agentType,
        description,
        agent,
        modelId: modelInfo?.modelId ?? null,
        providerId: modelInfo?.providerId ?? null,
      });
    } catch {
      // Ignore write errors from telemetry plugin
    }
  };
}
