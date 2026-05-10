import { describe, expect, test } from "bun:test"
import { SessionContext } from "../../src/context/session-context"
import type { Repos } from "../../src/db/interfaces"
import { createChatParamsHandler } from "../../src/handlers/chat-params"
import { createEventHandler } from "../../src/handlers/event"
import { createToolExecuteAfterHandler } from "../../src/handlers/tool-execute"

interface Spy<T> {
  calls: T[]
  impl: (arg: T) => void
}

function createSpy<T>(impl?: (arg: T) => void): Spy<T> {
  const calls: T[] = []
  return {
    calls,
    impl: (arg: T) => {
      calls.push(arg)
      impl?.(arg)
    },
  }
}

function createReposDouble(opts?: {
  throwOnSessionUpsert?: boolean
  throwOnSessionUpsertFull?: boolean
  throwOnMessageUpsert?: boolean
  throwOnToolInsert?: boolean
}): {
  repos: Repos
  spies: {
    sessionUpsert: Spy<{ sessionId: string; projectId: string | null }>
    sessionUpsertFull: Spy<{ sessionId: string; projectId: string | null; parentId: string | null; title: string | null; directory: string | null }>
    messageUpsert: Spy<{
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
    }>
    toolInsert: Spy<{
      sessionId: string
      callId: string
      toolName: string
      agentType: string | null
      description: string | null
      agent: string | null
      modelId: string | null
      providerId: string | null
    }>
  }
} {
  const sessionUpsert = createSpy<{ sessionId: string; projectId: string | null }>((_) => {
    if (opts?.throwOnSessionUpsert) throw new Error("session upsert failed")
  })
  const sessionUpsertFull = createSpy<{
    sessionId: string
    projectId: string | null
    parentId: string | null
    title: string | null
    directory: string | null
  }>((_) => {
    if (opts?.throwOnSessionUpsertFull) throw new Error("session full upsert failed")
  })
  const messageUpsert = createSpy<{
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
  }>((_) => {
    if (opts?.throwOnMessageUpsert) throw new Error("message upsert failed")
  })
  const toolInsert = createSpy<{
    sessionId: string
    callId: string
    toolName: string
    agentType: string | null
    description: string | null
    agent: string | null
    modelId: string | null
    providerId: string | null
  }>((_) => {
    if (opts?.throwOnToolInsert) throw new Error("tool insert failed")
  })

  const repos: Repos = {
    sessions: {
      upsert: (data) => sessionUpsert.impl(data),
      upsertFull: (data) => sessionUpsertFull.impl(data),
      getRootSessions: () => [],
      getChildSessions: () => [],
      deleteOrphaned: () => 0,
    },
    messages: {
      upsert: (data) => messageUpsert.impl(data),
      getModeStats: () => [],
      getTokenSummary: () => ({ today: 0, thisWeek: 0, thisMonth: 0, lastMonth: 0 }),
      getTodayTokens: (today) => ({ date: today, total: 0 }),
      getDailyTokensByModel: () => [],
      deleteOlderThan: () => 0,
    },
    toolCalls: {
      insert: (data) => toolInsert.impl(data),
      getAgentCalls: () => [],
      getToolUsageSummary: () => [],
      deleteOlderThan: () => 0,
    },
    dailyUsage: {
      recompute: () => {},
      getHistoryUntil: () => [],
    },
    vacuum: () => {},
    close: () => {},
  }

  return {
    repos,
    spies: {
      sessionUpsert,
      sessionUpsertFull,
      messageUpsert,
      toolInsert,
    },
  }
}

describe("createChatParamsHandler", () => {
  test("stores agent and model context", async () => {
    const context = new SessionContext("project-1")
    const handler = createChatParamsHandler(context)

    await handler(
      {
        sessionID: "sess-1",
        agent: "plan",
        modelID: "gpt-test",
        providerID: "openai",
      },
      undefined,
    )

    expect(context.getAgent("sess-1")).toBe("plan")
    expect(context.getModel("sess-1")).toEqual({ modelId: "gpt-test", providerId: "openai" })
  })

  test("does not write empty chat params into context", async () => {
    const context = new SessionContext("project-1")
    const handler = createChatParamsHandler(context)

    await handler(
      {
        sessionID: "sess-1",
      },
      undefined,
    )

    expect(context.getAgent("sess-1")).toBeNull()
    expect(context.getModel("sess-1")).toBeNull()
  })

  test("overwrites chat context for same session", async () => {
    const context = new SessionContext("project-1")
    const handler = createChatParamsHandler(context)

    await handler(
      {
        sessionID: "sess-1",
        agent: "plan",
        modelID: "gpt-1",
        providerID: "openai",
      },
      undefined,
    )
    await handler(
      {
        sessionID: "sess-1",
        agent: "build",
        modelID: "gpt-2",
        providerID: "openai",
      },
      undefined,
    )

    expect(context.getAgent("sess-1")).toBe("build")
    expect(context.getModel("sess-1")).toEqual({ modelId: "gpt-2", providerId: "openai" })
  })
})

describe("createToolExecuteAfterHandler", () => {
  test("stores tool call with session/project context", async () => {
    const context = new SessionContext("project-1")
    context.setAgent("sess-1", "build")
    context.setModel("sess-1", "gpt-4.1", "openai")
    const { repos, spies } = createReposDouble()
    const handler = createToolExecuteAfterHandler(context, repos)

    await handler(
      {
        sessionID: "sess-1",
        callID: "call-1",
        tool: "bash",
        args: { description: "run command" },
      },
      undefined,
    )

    expect(spies.sessionUpsert.calls.length).toBe(1)
    expect(spies.sessionUpsert.calls[0]).toEqual({
      sessionId: "sess-1",
      projectId: "project-1",
    })
    expect(spies.toolInsert.calls.length).toBe(1)
    expect(spies.toolInsert.calls[0]).toEqual({
      sessionId: "sess-1",
      callId: "call-1",
      toolName: "bash",
      agentType: null,
      description: "run command",
      agent: "build",
      modelId: "gpt-4.1",
      providerId: "openai",
    })
  })

  test("extracts task subagent type", async () => {
    const context = new SessionContext("project-1")
    const { repos, spies } = createReposDouble()
    const handler = createToolExecuteAfterHandler(context, repos)

    await handler(
      {
        sessionID: "sess-1",
        callID: "call-1",
        tool: "task",
        args: { subagent_type: "software-architect", description: "design" },
      },
      undefined,
    )

    expect(spies.toolInsert.calls[0]?.agentType).toBe("software-architect")
    expect(spies.toolInsert.calls[0]?.description).toBe("design")
  })

  test("ignores subagent_type for non-task tools", async () => {
    const context = new SessionContext("project-1")
    const { repos, spies } = createReposDouble()
    const handler = createToolExecuteAfterHandler(context, repos)

    await handler(
      {
        sessionID: "sess-1",
        callID: "call-1",
        tool: "bash",
        args: { subagent_type: "software-architect", description: "design" },
      },
      undefined,
    )

    expect(spies.toolInsert.calls[0]?.agentType).toBeNull()
  })

  test("stores null project id when context has no project", async () => {
    const context = new SessionContext(null)
    const { repos, spies } = createReposDouble()
    const handler = createToolExecuteAfterHandler(context, repos)

    await handler(
      {
        sessionID: "sess-1",
        callID: "call-1",
        tool: "bash",
      },
      undefined,
    )

    expect(spies.sessionUpsert.calls[0]).toEqual({
      sessionId: "sess-1",
      projectId: null,
    })
  })

  test("handles missing args", async () => {
    const context = new SessionContext("project-1")
    const { repos, spies } = createReposDouble()
    const handler = createToolExecuteAfterHandler(context, repos)

    await handler(
      {
        sessionID: "sess-1",
        callID: "call-1",
        tool: "bash",
      },
      undefined,
    )

    expect(spies.toolInsert.calls[0]?.agentType).toBeNull()
    expect(spies.toolInsert.calls[0]?.description).toBeNull()
  })

  test("swallows repository write errors", async () => {
    const context = new SessionContext("project-1")
    const { repos } = createReposDouble({ throwOnToolInsert: true })
    const handler = createToolExecuteAfterHandler(context, repos)

    await expect(
      handler(
        {
          sessionID: "sess-1",
          callID: "call-1",
          tool: "bash",
          args: { description: "run command" },
        },
        undefined,
      ),
    ).resolves.toBeUndefined()
  })

  test("swallows session upsert errors and skips tool insert", async () => {
    const context = new SessionContext("project-1")
    const { repos, spies } = createReposDouble({ throwOnSessionUpsert: true })
    const handler = createToolExecuteAfterHandler(context, repos)

    await expect(
      handler(
        {
          sessionID: "sess-1",
          callID: "call-1",
          tool: "bash",
        },
        undefined,
      ),
    ).resolves.toBeUndefined()

    expect(spies.sessionUpsert.calls.length).toBe(1)
    expect(spies.toolInsert.calls.length).toBe(0)
  })
})

describe("createEventHandler", () => {
  test("writes session metadata for session.updated", async () => {
    const context = new SessionContext("project-fallback")
    const { repos, spies } = createReposDouble()
    const handler = createEventHandler(context, repos)

    await handler({
      event: {
        type: "session.updated",
        properties: {
          info: {
            id: "sess-1",
            projectID: "project-1",
            parentID: "parent-1",
            title: "title",
            directory: "/tmp/work",
          },
        },
      },
    })

    expect(spies.sessionUpsertFull.calls.length).toBe(1)
    expect(spies.sessionUpsertFull.calls[0]).toEqual({
      sessionId: "sess-1",
      projectId: "project-1",
      parentId: "parent-1",
      title: "title",
      directory: "/tmp/work",
    })
  })

  test("uses project fallback when session event project id is missing", async () => {
    const context = new SessionContext("project-fallback")
    const { repos, spies } = createReposDouble()
    const handler = createEventHandler(context, repos)

    await handler({
      event: {
        type: "session.created",
        properties: {
          info: {
            id: "sess-1",
          },
        },
      },
    })

    expect(spies.sessionUpsertFull.calls.length).toBe(1)
    expect(spies.sessionUpsertFull.calls[0]?.projectId).toBe("project-fallback")
  })

  test("ignores session events without info or id", async () => {
    const context = new SessionContext("project-1")
    const { repos, spies } = createReposDouble()
    const handler = createEventHandler(context, repos)

    await handler({ event: { type: "session.created" } })
    await handler({ event: { type: "session.updated", properties: { info: {} } } })

    expect(spies.sessionUpsertFull.calls.length).toBe(0)
  })

  test("writes assistant message with token defaults", async () => {
    const context = new SessionContext("project-1")
    context.setAgent("sess-1", "plan")
    const { repos, spies } = createReposDouble()
    const handler = createEventHandler(context, repos)

    await handler({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg-1",
            sessionID: "sess-1",
            role: "assistant",
            modelID: "gpt-test",
            providerID: "openai",
          },
        },
      },
    })

    expect(spies.sessionUpsert.calls.length).toBe(1)
    expect(spies.messageUpsert.calls.length).toBe(1)
    expect(spies.messageUpsert.calls[0]).toEqual({
      sessionId: "sess-1",
      messageId: "msg-1",
      role: "assistant",
      modelId: "gpt-test",
      providerId: "openai",
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cost: 0,
      agent: "plan",
    })
  })

  test("writes assistant message with full token payload", async () => {
    const context = new SessionContext("project-1")
    const { repos, spies } = createReposDouble()
    const handler = createEventHandler(context, repos)

    await handler({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg-1",
            sessionID: "sess-1",
            role: "assistant",
            tokens: {
              input: 10,
              output: 20,
              reasoning: 30,
              cache: {
                read: 40,
                write: 50,
              },
            },
            cost: 0.123,
          },
        },
      },
    })

    expect(spies.messageUpsert.calls[0]).toEqual({
      sessionId: "sess-1",
      messageId: "msg-1",
      role: "assistant",
      modelId: null,
      providerId: null,
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 30,
      cacheReadTokens: 40,
      cacheWriteTokens: 50,
      cost: 0.123,
      agent: null,
    })
  })

  test("ignores non-assistant and missing message info", async () => {
    const context = new SessionContext("project-1")
    const { repos, spies } = createReposDouble()
    const handler = createEventHandler(context, repos)

    await handler({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg-1",
            sessionID: "sess-1",
            role: "user",
          },
        },
      },
    })
    await handler({
      event: {
        type: "message.updated",
        properties: {},
      },
    })
    await handler({
      event: {
        type: "message.updated",
      },
    })

    expect(spies.sessionUpsert.calls.length).toBe(0)
    expect(spies.messageUpsert.calls.length).toBe(0)
  })

  test("ignores unknown event types", async () => {
    const context = new SessionContext("project-1")
    const { repos, spies } = createReposDouble()
    const handler = createEventHandler(context, repos)

    await handler({
      event: {
        type: "tool.execute.before",
      },
    })

    expect(spies.sessionUpsert.calls.length).toBe(0)
    expect(spies.sessionUpsertFull.calls.length).toBe(0)
    expect(spies.messageUpsert.calls.length).toBe(0)
    expect(spies.toolInsert.calls.length).toBe(0)
  })

  test("swallows repository write errors", async () => {
    const context = new SessionContext("project-1")
    const { repos } = createReposDouble({ throwOnMessageUpsert: true })
    const handler = createEventHandler(context, repos)

    await expect(
      handler({
        event: {
          type: "message.updated",
          properties: {
            info: {
              id: "msg-1",
              sessionID: "sess-1",
              role: "assistant",
            },
          },
        },
      }),
    ).resolves.toBeUndefined()
  })

  test("swallows session metadata write errors", async () => {
    const context = new SessionContext("project-1")
    const { repos } = createReposDouble({ throwOnSessionUpsertFull: true })
    const handler = createEventHandler(context, repos)

    await expect(
      handler({
        event: {
          type: "session.created",
          properties: {
            info: {
              id: "sess-1",
            },
          },
        },
      }),
    ).resolves.toBeUndefined()
  })
})
