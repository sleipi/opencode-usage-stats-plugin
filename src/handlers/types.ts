export interface HookHandler<TInput = unknown, TOutput = unknown> {
  (input: TInput, output: TOutput): Promise<void>
}

export interface EventEnvelope {
  event: OpenCodeEvent
}

export interface EventHandler {
  (payload: EventEnvelope): Promise<void>
}

export interface OpenCodeEvent {
  type: string
  properties?: {
    info?: unknown
  }
}

export interface ChatParamsInput {
  sessionID: string
  agent?: string
  modelID?: string
  providerID?: string
}

export interface ToolExecuteAfterInput {
  sessionID: string
  callID: string
  tool: string
  args?: Record<string, unknown>
}

export interface SessionInfo {
  id: string
  projectID?: string
  parentID?: string
  title?: string
  directory?: string
}

export interface MessageTokens {
  input?: number
  output?: number
  reasoning?: number
  cache?: {
    read?: number
    write?: number
  }
}

export interface MessageInfo {
  id: string
  sessionID: string
  role: string
  modelID?: string
  providerID?: string
  tokens?: MessageTokens
  cost?: number
}

export interface SessionEvent extends OpenCodeEvent {
  type: "session.created" | "session.updated"
  properties?: {
    info?: SessionInfo
  }
}

export interface MessageUpdatedEvent extends OpenCodeEvent {
  type: "message.updated"
  properties?: {
    info?: MessageInfo
  }
}

export function isSessionEvent(event: OpenCodeEvent): event is SessionEvent {
  return event.type === "session.created" || event.type === "session.updated"
}

export function isMessageUpdatedEvent(event: OpenCodeEvent): event is MessageUpdatedEvent {
  return event.type === "message.updated"
}
