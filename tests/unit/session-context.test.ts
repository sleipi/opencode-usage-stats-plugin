import { describe, expect, test } from "bun:test"
import { SessionContext } from "../../src/context/session-context"

describe("SessionContext", () => {
  test("returns provided project id", () => {
    const context = new SessionContext("project-1")
    expect(context.getProjectId()).toBe("project-1")
  })

  test("returns null project id when constructed with null", () => {
    const context = new SessionContext(null)
    expect(context.getProjectId()).toBeNull()
  })

  test("stores and reads agent by session id", () => {
    const context = new SessionContext("project-1")
    context.setAgent("sess-1", "plan")
    expect(context.getAgent("sess-1")).toBe("plan")
  })

  test("overwrites agent for same session id", () => {
    const context = new SessionContext("project-1")
    context.setAgent("sess-1", "plan")
    context.setAgent("sess-1", "build")
    expect(context.getAgent("sess-1")).toBe("build")
  })

  test("ignores null and undefined agents", () => {
    const context = new SessionContext("project-1")
    context.setAgent("sess-1", null)
    context.setAgent("sess-2", undefined)
    expect(context.getAgent("sess-1")).toBeNull()
    expect(context.getAgent("sess-2")).toBeNull()
  })

  test("returns null for unknown session agent", () => {
    const context = new SessionContext("project-1")
    expect(context.getAgent("missing")).toBeNull()
  })

  test("stores and reads model info by session id", () => {
    const context = new SessionContext("project-1")
    context.setModel("sess-1", "gpt-test", "openai")
    expect(context.getModel("sess-1")).toEqual({ modelId: "gpt-test", providerId: "openai" })
  })

  test("overwrites model info for same session id", () => {
    const context = new SessionContext("project-1")
    context.setModel("sess-1", "gpt-test", "openai")
    context.setModel("sess-1", "claude-test", "anthropic")
    expect(context.getModel("sess-1")).toEqual({ modelId: "claude-test", providerId: "anthropic" })
  })

  test("stores model info when only model id is present", () => {
    const context = new SessionContext("project-1")
    context.setModel("sess-1", "gpt-test", null)
    expect(context.getModel("sess-1")).toEqual({ modelId: "gpt-test", providerId: null })
  })

  test("stores model info when only provider id is present", () => {
    const context = new SessionContext("project-1")
    context.setModel("sess-1", null, "openai")
    expect(context.getModel("sess-1")).toEqual({ modelId: null, providerId: "openai" })
  })

  test("ignores model update when model and provider are both absent", () => {
    const context = new SessionContext("project-1")
    context.setModel("sess-1", null, null)
    expect(context.getModel("sess-1")).toBeNull()
  })

  test("returns null for unknown session model", () => {
    const context = new SessionContext("project-1")
    expect(context.getModel("missing")).toBeNull()
  })
})
