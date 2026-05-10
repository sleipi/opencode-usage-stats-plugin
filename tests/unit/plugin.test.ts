import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

function createTempDb() {
  const dir = mkdtempSync(join(tmpdir(), "opencode-usage-stats-plugin-"))
  const dbPath = join(dir, "usage-stats.db")
  process.env.OPENCODE_USAGE_STATS_DB = dbPath
  return { dir, dbPath }
}

function cleanupTempDb(dir: string) {
  delete process.env.OPENCODE_USAGE_STATS_DB
  rmSync(dir, { recursive: true, force: true })
}

describe("UsageStatsPlugin hooks", () => {
  const { dir, dbPath } = createTempDb()
  let mod: typeof import("../../src/plugin")

  beforeAll(async () => {
    mod = await import("../../src/plugin")
  })

  beforeEach(() => {
    const db = new Database(dbPath)
    db.run("PRAGMA user_version = 0")
    db.run("DROP TABLE IF EXISTS daily_usage")
    db.run("DROP TABLE IF EXISTS messages")
    db.run("DROP TABLE IF EXISTS tool_calls")
    db.run("DROP TABLE IF EXISTS sessions")
    db.close()
  })

  afterAll(() => {
    cleanupTempDb(dir)
  })

  test("tool.execute.after upserts session and stores tool call", async () => {
    const hooks = await mod.UsageStatsPlugin({ project: { id: "project-2" } } as any)

    await hooks["tool.execute.after"](
      {
        sessionID: "sess-2",
        callID: "call-2",
        tool: "bash",
        args: { description: "list files" },
      } as any,
      {} as any,
    )

    const checkDb = new Database(dbPath, { readonly: true })
    const session = checkDb.prepare("SELECT session_id, project_id FROM sessions WHERE session_id = ?").get("sess-2") as
      | { session_id: string; project_id: string }
      | null
    const toolCall = checkDb
      .prepare("SELECT session_id, call_id, tool_name, description FROM tool_calls WHERE call_id = ?")
      .get("call-2") as { session_id: string; call_id: string; tool_name: string; description: string } | null

    expect(session).not.toBeNull()
    expect(session?.project_id).toBe("project-2")
    expect(toolCall).not.toBeNull()
    expect(toolCall?.session_id).toBe("sess-2")
    expect(toolCall?.tool_name).toBe("bash")
    expect(toolCall?.description).toBe("list files")
    checkDb.close()
  })

  test("chat.params stores agent and model/provider for following tool call", async () => {
    const hooks = await mod.UsageStatsPlugin({ project: { id: "project-1" } } as any)

    await hooks["chat.params"](
      {
        sessionID: "sess-1",
        agent: "plan",
        modelID: "gpt-test",
        providerID: "openai",
      } as any,
      {} as any,
    )

    await hooks["tool.execute.after"](
      {
        sessionID: "sess-1",
        callID: "call-1",
        tool: "bash",
        args: { description: "run command" },
      } as any,
      {} as any,
    )

    const checkDb = new Database(dbPath, { readonly: true })
    const row = checkDb
      .prepare("SELECT agent, model_id, provider_id, description FROM tool_calls WHERE call_id = ?")
      .get("call-1") as { agent: string; model_id: string; provider_id: string; description: string } | null

    expect(row).not.toBeNull()
    expect(row?.agent).toBe("plan")
    expect(row?.model_id).toBe("gpt-test")
    expect(row?.provider_id).toBe("openai")
    expect(row?.description).toBe("run command")
    checkDb.close()
  })

  test("event session.created upserts metadata", async () => {
    const hooks = await mod.UsageStatsPlugin({ project: { id: "project-1" } } as any)

    await hooks.event({
      event: {
        type: "session.created",
        properties: {
          info: {
            id: "sess-meta",
            projectID: "project-x",
            parentID: "parent-1",
            title: "My Session",
            directory: "/tmp/work",
          },
        },
      },
    } as any)

    const checkDb = new Database(dbPath, { readonly: true })
    const row = checkDb
      .prepare("SELECT session_id, project_id, parent_id, title, directory FROM sessions WHERE session_id = ?")
      .get("sess-meta") as
      | { session_id: string; project_id: string; parent_id: string; title: string; directory: string }
      | null

    expect(row).not.toBeNull()
    expect(row?.project_id).toBe("project-x")
    expect(row?.parent_id).toBe("parent-1")
    expect(row?.title).toBe("My Session")
    expect(row?.directory).toBe("/tmp/work")
    checkDb.close()
  })

  test("event message.updated inserts assistant message", async () => {
    const hooks = await mod.UsageStatsPlugin({ project: { id: "project-1" } } as any)

    await hooks.event({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg-1",
            sessionID: "sess-msg",
            role: "assistant",
            modelID: "gpt-4.1",
            providerID: "openai",
            tokens: {
              input: 10,
              output: 5,
              reasoning: 2,
              cache: { read: 3, write: 1 },
            },
            cost: 0.42,
          },
        },
      },
    } as any)

    const checkDb = new Database(dbPath, { readonly: true })
    const msg = checkDb
      .prepare(`
        SELECT session_id, message_id, role, model_id, provider_id,
               input_tokens, output_tokens, reasoning_tokens,
               cache_read_tokens, cache_write_tokens, cost
        FROM messages
        WHERE message_id = ?
      `)
      .get("msg-1") as
      | {
          session_id: string
          message_id: string
          role: string
          model_id: string
          provider_id: string
          input_tokens: number
          output_tokens: number
          reasoning_tokens: number
          cache_read_tokens: number
          cache_write_tokens: number
          cost: number
        }
      | null

    expect(msg).not.toBeNull()
    expect(msg?.session_id).toBe("sess-msg")
    expect(msg?.role).toBe("assistant")
    expect(msg?.model_id).toBe("gpt-4.1")
    expect(msg?.provider_id).toBe("openai")
    expect(msg?.input_tokens).toBe(10)
    expect(msg?.output_tokens).toBe(5)
    expect(msg?.reasoning_tokens).toBe(2)
    expect(msg?.cache_read_tokens).toBe(3)
    expect(msg?.cache_write_tokens).toBe(1)
    expect(msg?.cost).toBe(0.42)
    checkDb.close()
  })

  test("hooks tolerate write failures without throwing", async () => {
    const hooks = await mod.UsageStatsPlugin({ project: { id: "project-1" } } as any)

    const db = new Database(dbPath)
    db.run("DROP TABLE IF EXISTS messages")
    db.run("DROP TABLE IF EXISTS sessions")
    db.run("DROP TABLE IF EXISTS tool_calls")
    db.close()

    await expect(
      hooks["tool.execute.after"](
        {
          sessionID: "sess-1",
          callID: "call-1",
          tool: "bash",
        } as any,
        {} as any,
      ),
    ).resolves.toBeUndefined()

    await expect(
      hooks.event({
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
      } as any),
    ).resolves.toBeUndefined()
  })
})
