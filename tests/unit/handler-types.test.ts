import { describe, expect, test } from "bun:test"
import { isMessageUpdatedEvent, isSessionEvent } from "../../src/handlers/types"

describe("handler type guards", () => {
  test("isSessionEvent matches session.created and session.updated", () => {
    expect(isSessionEvent({ type: "session.created" })).toBe(true)
    expect(isSessionEvent({ type: "session.updated" })).toBe(true)
  })

  test("isSessionEvent rejects non-session events", () => {
    expect(isSessionEvent({ type: "message.updated" })).toBe(false)
    expect(isSessionEvent({ type: "unknown" })).toBe(false)
  })

  test("isMessageUpdatedEvent matches message.updated", () => {
    expect(isMessageUpdatedEvent({ type: "message.updated" })).toBe(true)
  })

  test("isMessageUpdatedEvent rejects non-message.updated events", () => {
    expect(isMessageUpdatedEvent({ type: "session.created" })).toBe(false)
    expect(isMessageUpdatedEvent({ type: "unknown" })).toBe(false)
  })
})
