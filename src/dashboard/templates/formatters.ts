export function fmtCompact(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return m % 1 === 0 ? `${Math.round(m)}m` : `${m.toFixed(1)}m`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return k % 1 === 0 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
  }
  return n.toString();
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fmt(n: number): string {
  return n.toLocaleString("de-DE");
}

export function fmtCost(n: number): string {
  if (n <= 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function renderTokens(
  input: number,
  cache: number,
  output: number,
  reasoning: number,
): string {
  const totalIn = input + cache;
  const cachePercent = totalIn > 0 ? Math.round((cache / totalIn) * 100) : 0;
  const cacheInfo =
    cache > 0
      ? ` <span class="token-cache">(${cachePercent}% cached)<span class="info-icon" title="Cache-Read-Tokens: Input-Tokens die der Provider aus seinem Prompt-Cache liest statt neu zu verarbeiten. In langen Konversationen bleibt der bisherige Kontext (System-Prompt, vorherige Nachrichten, Tool-Outputs) gecached. Das ist schneller und g\u00FCnstiger (bis zu 90% Rabatt bei Anthropic).">?</span></span>`
      : "";

  let html = `<span class="token-in">${fmtCompact(totalIn)} in</span>${cacheInfo}`;
  html += ` <span class="token-sep">/</span> <span class="token-out">${fmtCompact(output)} out</span>`;
  if (reasoning > 0) {
    html += ` <span class="token-sep">/</span> <span class="token-reasoning">${fmtCompact(reasoning)} reasoning</span>`;
  }
  return html;
}
