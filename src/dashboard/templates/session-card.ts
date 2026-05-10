import type { SessionStats } from "../services/types";
import { esc, renderTokens } from "./formatters";

export function renderSessionCard(s: SessionStats): string {
  const title = s.title || s.directory?.split("/").pop() || s.session_id;
  const time = s.last_seen?.replace("T", " ").slice(0, 16) ?? "";

  const agentRows = s.agents
    .map((a) => {
      const agentTokens = renderTokens(
        a.input_tokens,
        a.cache_read_tokens,
        a.output_tokens,
        a.reasoning_tokens,
      );
      const model = a.model_id
        ? `<span class="agent-model">${esc(a.model_id)}</span>`
        : "";
      return `
      <div class="agent-row">
        <span class="agent-badge">${esc(a.agent_type)}</span>
        <span class="agent-calls">${a.call_count}x</span>
        ${model}
        <span class="tokens-detail">${agentTokens}</span>
      </div>`;
    })
    .join("");

  const sessionTokens = renderTokens(
    s.input_tokens,
    s.cache_read_tokens,
    s.output_tokens,
    s.reasoning_tokens,
  );

  const modeRows = s.modes
    .map((m) => {
      const modeTokens = renderTokens(
        m.input_tokens,
        m.cache_read_tokens,
        m.output_tokens,
        m.reasoning_tokens,
      );
      const label = m.agent.charAt(0).toUpperCase() + m.agent.slice(1);
      const modelInfo =
        m.provider_id || m.model_id
          ? ` <span class="mode-model">${esc([m.provider_id, m.model_id].filter(Boolean).join(" / "))}</span>`
          : "";
      const costStr =
        m.cost > 0
          ? ` <span class="mode-cost">$${m.cost.toFixed(4)}</span>`
          : "";
      return `
      <div class="mode-row">
        <span class="mode-badge mode-${esc(m.agent)}">${esc(label)}</span>
        ${modelInfo}
        <span class="mode-msgs">${m.message_count} msgs</span>
        <span class="tokens-detail">${modeTokens}</span>
        ${costStr}
      </div>`;
    })
    .join("");

  return `
    <div class="session-card">
      <div class="session-header">
        <div class="session-title">${esc(title)}</div>
        <div class="session-time">${time}</div>
      </div>
      <div class="session-meta">
        ${s.directory ? `<span class="session-dir">${esc(s.directory)}</span>` : ""}
        <span class="session-id">${esc(s.session_id)}</span>
      </div>
      <div class="session-tokens">
        <span class="token-label">Tokens:</span>
        ${sessionTokens}
      </div>
      ${agentRows ? `<div class="agents-section"><div class="agents-label">Agents</div>${agentRows}</div>` : ""}
      ${modeRows ? `<div class="agents-section"><div class="agents-label">Mode</div>${modeRows}</div>` : ""}
    </div>`;
}
