import type { Plugin } from "@opencode-ai/plugin"
import { join } from "path"
import { createSqliteRepos } from "./db/sqlite-repository"

const DB_PATH = process.env.OPENCODE_USAGE_STATS_DB || join(process.env.HOME || "~", ".config", "opencode", "usage-stats.db")

export const UsageStatsPlugin: Plugin = async (ctx) => {
  const repos = createSqliteRepos(DB_PATH)

  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  repos.dailyUsage.recompute(sevenDaysAgo, today)

  const projectId = ctx.project?.id ?? null
  const sessionAgentMap = new Map<string, string>()
  const sessionModelMap = new Map<string, { model_id: string; provider_id: string }>()

  return {
    "chat.params": async (input, _output) => {
      if (input.agent) {
        sessionAgentMap.set(input.sessionID, input.agent)
      }

      if (input.modelID || input.providerID) {
        sessionModelMap.set(input.sessionID, {
          model_id: (input as any).modelID ?? "",
          provider_id: (input as any).providerID ?? "",
        })
      }
    },

    "tool.execute.after": async (input, _output) => {
      const args = input.args as Record<string, unknown> | undefined
      const agentType = input.tool === "task" && args?.subagent_type
        ? String(args.subagent_type)
        : null
      const description = args?.description ? String(args.description) : null
      const agent = sessionAgentMap.get(input.sessionID) ?? null
      const modelInfo = sessionModelMap.get(input.sessionID)

      try {
        repos.sessions.upsert({
          sessionId: input.sessionID,
          projectId,
        })

        repos.toolCalls.insert({
          sessionId: input.sessionID,
          callId: input.callID,
          toolName: input.tool,
          agentType,
          description,
          agent,
          modelId: modelInfo?.model_id ?? null,
          providerId: modelInfo?.provider_id ?? null,
        })
      } catch {
        // Ignore write errors from telemetry plugin
      }
    },

    event: async ({ event }) => {
      try {
        if (event.type === "session.created" || event.type === "session.updated") {
          const session = (event as any).properties?.info
          if (session?.id) {
            repos.sessions.upsertFull({
              sessionId: session.id,
              projectId: session.projectID ?? projectId,
              parentId: session.parentID ?? null,
              title: session.title ?? null,
              directory: session.directory ?? null,
            })
          }
          return
        }

        if (event.type === "message.updated") {
          const msg = (event as any).properties?.info
          if (!msg || msg.role !== "assistant") return

          repos.sessions.upsert({
            sessionId: msg.sessionID,
            projectId,
          })

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
            agent: sessionAgentMap.get(msg.sessionID) ?? null,
          })
        }
      } catch {
        // Ignore write errors from telemetry plugin
      }
    },
  }
}
