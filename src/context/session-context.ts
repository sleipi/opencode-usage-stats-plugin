export interface SessionModelInfo {
  modelId: string | null;
  providerId: string | null;
}

export class SessionContext {
  private readonly sessionAgentMap = new Map<string, string>();
  private readonly sessionModelMap = new Map<string, SessionModelInfo>();

  constructor(private readonly projectId: string | null) {}

  getProjectId(): string | null {
    return this.projectId;
  }

  setAgent(sessionId: string, agent: string | null | undefined): void {
    if (agent) {
      this.sessionAgentMap.set(sessionId, agent);
    }
  }

  getAgent(sessionId: string): string | null {
    return this.sessionAgentMap.get(sessionId) ?? null;
  }

  setModel(
    sessionId: string,
    modelId: string | null | undefined,
    providerId: string | null | undefined,
  ): void {
    if (modelId || providerId) {
      this.sessionModelMap.set(sessionId, {
        modelId: modelId ?? null,
        providerId: providerId ?? null,
      });
    }
  }

  getModel(sessionId: string): SessionModelInfo | null {
    return this.sessionModelMap.get(sessionId) ?? null;
  }
}
