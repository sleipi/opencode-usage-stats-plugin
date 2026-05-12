export const DASHBOARD_CSS = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "SF Mono", "Fira Code", "JetBrains Mono", monospace;
      background: #0d1117;
      color: #c9d1d9;
      padding: 24px;
      max-width: none;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid #21262d;
    }
    .header h1 { font-size: 18px; font-weight: 600; color: #f0f6fc; }
    .refresh-badge {
      font-size: 12px; color: #8b949e;
      display: flex; align-items: center; gap: 10px;
    }
    .refresh-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #238636;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    .refresh-timing {
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      background: #1f2937;
      color: #6e7681;
      border: 1px solid #30363d;
      transition: all 0.3s;
    }
    .refresh-timing.slow {
      background: #3a2f1a;
      color: #d29922;
      border-color: #5c4a1f;
    }
    .refresh-timing.very-slow {
      background: #3a2416;
      color: #f0883e;
      border-color: #5c3d1f;
    }
    .session-card {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      transition: border-color 0.2s;
    }
    .session-card:hover { border-color: #388bfd; }
    .session-header {
      display: flex; justify-content: space-between;
      align-items: center; margin-bottom: 4px;
    }
    .session-title { font-size: 15px; font-weight: 600; color: #f0f6fc; }
    .session-time { font-size: 12px; color: #484f58; }
    .session-meta {
      display: flex; gap: 8px; align-items: center;
      margin-bottom: 8px; font-size: 11px;
      word-break: break-all;
    }
    .session-id { color: #484f58; }
    .session-dir { color: #8b949e; }
    .session-dir::after { content: "|"; margin-left: 8px; color: #30363d; }
    .session-tokens {
      font-size: 13px;
      display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
    }
    .token-label { color: #8b949e; }
    .token-in { color: #58a6ff; }
    .token-out { color: #3fb950; }
    .token-reasoning { color: #d2a8ff; }
    .token-cache { color: #8b949e; font-size: 12px; }
    .info-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 14px; height: 14px; border-radius: 50%;
      border: 1px solid #30363d; font-size: 10px;
      color: #8b949e; cursor: help; margin-left: 3px;
      vertical-align: middle;
    }
    .info-icon:hover { border-color: #58a6ff; color: #58a6ff; }
    .token-sep { color: #30363d; }
    .agents-section {
      margin-top: 12px; padding-top: 10px;
      border-top: 1px solid #21262d;
    }
    .agents-label {
      font-size: 11px; color: #8b949e;
      text-transform: uppercase; letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .agent-row {
      display: flex; align-items: center; gap: 10px;
      padding: 4px 0 4px 12px; font-size: 13px;
      border-left: 2px solid #21262d; margin-bottom: 4px;
    }
    .agent-badge {
      background: #1f2937; border: 1px solid #30363d;
      border-radius: 4px; padding: 1px 8px;
      font-size: 12px; color: #79c0ff; white-space: nowrap;
    }
    .agent-calls { color: #8b949e; font-size: 12px; min-width: 24px; }
    .agent-model { color: #484f58; font-size: 11px; }
    .tokens-detail { color: #8b949e; font-size: 12px; margin-left: auto; }
    .tokens-detail .token-in { color: #58a6ff; }
    .tokens-detail .token-out { color: #3fb950; }
    .tokens-detail .token-reasoning { color: #d2a8ff; }
    .tokens-detail .token-cache { color: #6e7681; }
    .tokens-detail .token-sep { color: #30363d; }
    .mode-row {
      display: flex; align-items: center; gap: 10px;
      padding: 4px 0 4px 12px; font-size: 13px;
      border-left: 2px solid #21262d; margin-bottom: 4px;
    }
    .mode-badge {
      background: #1f2937; border: 1px solid #30363d;
      border-radius: 4px; padding: 1px 8px;
      font-size: 12px; white-space: nowrap;
    }
    .mode-plan { color: #3fb950; border-color: #238636; }
    .mode-build { color: #f0883e; border-color: #d47616; }
    .mode-msgs { color: #8b949e; font-size: 12px; min-width: 50px; }
    .mode-model { color: #484f58; font-size: 11px; }
    .mode-cost { color: #f0883e; font-size: 12px; }
    .empty {
      text-align: center; color: #484f58;
      padding: 48px; font-size: 14px;
    }
    .stats-bar {
      display: flex;
      align-items: center;
      padding: 8px 0; margin-bottom: 0;
      font-size: 12px;
      white-space: nowrap;
    }
    .stats-pair {
      width: 160px;
      flex-shrink: 0;
    }
    .stats-label { color: #8b949e; }
    .stats-value { color: #f0f6fc; font-weight: 600; margin-left: 4px; }
    .stats-badge { width: 190px; flex-shrink: 0; }
    .mode-stats-bar {
      margin-bottom: 0; padding: 6px 0;
    }
    .mode-stats-bar:last-of-type {
      margin-bottom: 0;
    }
    .section-divider {
      border: none; border-top: 1px solid #21262d;
      margin: 16px 0;
    }
    .mode-overall { color: #58a6ff; border-color: #1f6feb; }
    .mode-cost-overall { color: #f0883e; border-color: #d18616; }
    .cost-value { color: #f0883e; }
    .tool-usage-section { margin-bottom: 8px; }
    .tool-group {
      margin-bottom: 12px;
      border: 1px solid #21262d;
      border-radius: 8px;
      background: #161b22;
    }
    .tool-group-header {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px;
      cursor: pointer;
      list-style: none;
    }
    .tool-group-header::-webkit-details-marker { display: none; }
    .tool-group-model { font-size: 11px; color: #484f58; }
    .tool-group-total { margin-left: auto; font-size: 11px; color: #8b949e; }
    .tool-group-body { padding: 0 10px 8px 10px; }
    .tool-row {
      display: grid;
      grid-template-columns: 190px repeat(4, 160px);
      align-items: center;
      padding: 3px 0; font-size: 12px;
      margin-bottom: 2px;
      white-space: nowrap;
    }
    .tool-name {
      justify-self: start;
      background: #1f2937; border: 1px solid #30363d;
      border-radius: 4px; padding: 1px 8px;
      font-size: 12px; color: #8b949e; white-space: nowrap;
    }
    .tool-row .stats-pair { width: 160px; flex-shrink: 0; }
    .daily-chart {
      margin-bottom: 24px; padding-bottom: 16px;
      border-bottom: 1px solid #21262d;
    }
    .chart-title {
      font-size: 12px; color: #8b949e; text-transform: uppercase;
      letter-spacing: 0.5px; margin-bottom: 12px;
    }
    .chart-container {
      display: flex; align-items: flex-end; gap: 2px;
      height: 80px;
      position: relative;
    }
    .chart-avg-line {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
    }
    .chart-col {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: flex-end;
      height: 100%; min-width: 0;
      position: relative;
    }
    .chart-value {
      display: none;
      font-size: 9px; color: #8b949e; margin-bottom: 4px;
      white-space: nowrap;
    }
    .chart-col:hover .chart-value { display: block; }
    .chart-bar {
      width: 100%; min-height: 2px;
      background: #238636; border-radius: 2px 2px 0 0;
      transition: background 0.2s;
    }
    .chart-col:hover .chart-bar { background: #3fb950; }
    .chart-tooltip {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background: #1c2128;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      color: #f0f6fc;
      white-space: nowrap;
      text-align: center;
      z-index: 10;
      pointer-events: none;
      line-height: 1.5;
    }
    .chart-col:hover .chart-tooltip { display: block; }
    .chart-legend {
      display: flex;
      column-gap: 20px;
      row-gap: 4px;
      justify-content: flex-end;
      flex-wrap: wrap;
      margin-top: 8px; font-size: 11px; color: #8b949e;
      line-height: 1.2;
    }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .legend-bar {
      width: 12px; height: 8px; background: #238636;
      border-radius: 2px; display: inline-block;
    }
    .legend-line {
      width: 16px; height: 2px; background: #f0883e;
      display: inline-block; border-radius: 1px;
    }
    .model-bar-stack {
      width: 100%; display: flex; flex-direction: column-reverse;
      border-radius: 2px 2px 0 0; overflow: hidden;
    }
    .model-bar-seg {
      width: 100%; min-height: 0;
    }
    .two-col {
      display: flex; gap: 24px; align-items: flex-start;
    }
    .left-panel {
      flex: 1; min-width: 0;
      position: sticky; top: 24px; align-self: flex-start;
      background: rgba(255, 255, 255, 0.02);
      border-radius: 8px;
      padding: 16px 24px 16px 16px;
    }
    .right-panel {
      flex: 1; min-width: 0;
      border-left: 1px solid #21262d;
      padding-left: 24px;
    }
    .right-panel-title {
      font-size: 12px; color: #8b949e; text-transform: uppercase;
      letter-spacing: 0.5px; margin-bottom: 12px;
    }
    .session-card--active {
      border-color: #56d364;
      box-shadow: 0 0 0 1px #56d364, 0 0 12px rgba(86, 211, 100, 0.35);
    }
    .session-card--recent {
      border-color: #3fb950;
    }
    .session-card--idle {
      border-color: #2ea043;
    }
    .session-card--stale {
      border-color: #1a4d1f;
    }
    .session-card--old {
      border-color: #1a3a1f;
    }
    #dir-filter {
      appearance: none;
      -webkit-appearance: none;
      background: #161b22 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' fill='none' stroke='%238b949e' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 12px center;
      color: #c9d1d9;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 8px 36px 8px 12px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      width: 100%;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    #dir-filter:hover { border-color: #484f58; }
    #dir-filter:focus { outline: none; border-color: #58a6ff; box-shadow: 0 0 0 2px rgba(56,139,253,0.25); }
    .filter-bar {
      margin-bottom: 16px;
    }
    @media (max-width: 1000px) {
      .two-col { flex-direction: column; }
      .left-panel { position: static; }
    }`;
