export interface SessionUpsertData {
  sessionId: string;
  projectId: string | null;
}

export interface SessionFullData {
  sessionId: string;
  projectId: string | null;
  parentId: string | null;
  title: string | null;
  directory: string | null;
}

export interface RootSessionRow {
  session_id: string;
  title: string | null;
  directory: string | null;
  first_seen: string;
  last_seen: string;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost: number;
}

export interface ChildSessionRow {
  session_id: string;
  parent_id: string | null;
  title: string | null;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  model_id: string | null;
  provider_id: string | null;
}

export interface SessionRepo {
  upsert(data: SessionUpsertData): void;
  upsertFull(data: SessionFullData): void;
  getRootSessions(): RootSessionRow[];
  getChildSessions(): ChildSessionRow[];
  deleteOrphaned(cutoffDate: string): number;
}
