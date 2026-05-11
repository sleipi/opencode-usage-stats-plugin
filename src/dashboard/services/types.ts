export interface SessionStats {
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
  agents: AgentStats[];
  modes: ModeStats[];
}

export interface AgentStats {
  agent_type: string;
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  model_id: string | null;
  provider_id: string | null;
}

export interface ModeStats {
  agent: string;
  message_count: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  cost: number;
  model_id: string | null;
  provider_id: string | null;
}
