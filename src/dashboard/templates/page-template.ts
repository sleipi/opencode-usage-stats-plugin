import type {
  DailyModelTokens,
  TokenSummary,
} from "../../db/message/message-repo";
import type { DailyTokens } from "../../db/shared-types";
import type { ToolGroupSummary } from "../../db/tool-call/tool-call-repo";
import type { SessionStats } from "../services/types";
import { renderSessionsFragment } from "./sessions-fragment";
import { DASHBOARD_CSS } from "./styles";

export const CLIENT_SCRIPT = `
    function collectOpenToolGroups() {
      const open = new Set();
      document.querySelectorAll('.tool-group[data-group-key]').forEach((el) => {
        if (el.open) {
          const key = el.getAttribute('data-group-key');
          if (key) open.add(key);
        }
      });
      return open;
    }

    function restoreOpenToolGroups(openKeys) {
      const groups = document.querySelectorAll('.tool-group[data-group-key]');
      let opened = 0;
      groups.forEach((el) => {
        const key = el.getAttribute('data-group-key');
        const shouldOpen = !!key && openKeys.has(key);
        el.open = shouldOpen;
        if (shouldOpen) opened += 1;
      });

    }

    async function refresh() {
      const start = performance.now();
      const openToolGroups = collectOpenToolGroups();
      try {
        const res = await fetch("/api/stats");
        const html = await res.text();
        document.getElementById("sessions").innerHTML = html;
        restoreOpenToolGroups(openToolGroups);
        const duration = Math.round(performance.now() - start);
        updateRefreshTiming(duration);
      } catch {
        updateRefreshTiming(null);
      }
    }
    function updateRefreshTiming(ms) {
      const el = document.getElementById("refresh-timing");
      if (ms === null) {
        el.textContent = "failed";
        el.className = "refresh-timing very-slow";
        return;
      }
      el.textContent = \`took \${ms}ms\`;
      if (ms > 1000) {
        el.className = "refresh-timing very-slow";
      } else if (ms > 500) {
        el.className = "refresh-timing slow";
      } else {
        el.className = "refresh-timing";
      }
    }
    setInterval(refresh, 5000);`;

export function renderHTML(
  sessions: SessionStats[],
  summary: TokenSummary,
  daily: DailyTokens[],
  dailyModel: DailyModelTokens[],
  toolGroups: ToolGroupSummary[],
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenCode Usage Stats</title>
  <style>${DASHBOARD_CSS}</style>
</head>
<body>
  <div class="header">
    <h1>OpenCode Usage Stats</h1>
    <div class="refresh-badge">
      <div class="refresh-dot"></div>
      <span>auto-refresh 5s</span>
      <span id="refresh-timing" class="refresh-timing"></span>
    </div>
  </div>
  <div id="sessions">
    ${renderSessionsFragment(sessions, summary, daily, dailyModel, toolGroups)}
  </div>
  <script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}
