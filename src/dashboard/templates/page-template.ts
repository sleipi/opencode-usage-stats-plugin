import type {
  CostSummary,
  DailyModelTokens,
  TokenSummary,
} from "../../db/message/message-repo";
import type { DailyTokens } from "../../db/shared-types";
import type { ToolGroupSummary } from "../../db/tool-call/tool-call-repo";
import type { BudgetStatus } from "../services/budget-service";
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

    let currentDirFilter = "";

    function attachDirFilter() {
      const el = document.getElementById("dir-filter");
      if (!el) return;
      el.value = currentDirFilter;
      el.addEventListener("change", function() {
        currentDirFilter = el.value;
        refresh();
      });
    }

    async function refresh() {
      const start = performance.now();
      const openToolGroups = collectOpenToolGroups();
      const dirEl = document.getElementById("dir-filter");
      if (dirEl) currentDirFilter = dirEl.value;
      const params = currentDirFilter ? "?dir=" + encodeURIComponent(currentDirFilter) : "";
      try {
        const res = await fetch("/api/stats" + params);
        const html = await res.text();
        document.getElementById("sessions").innerHTML = html;
        attachDirFilter();
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
    setInterval(refresh, 5000);
    attachDirFilter();

    async function openBudgetModal() {
      const modal = document.getElementById('budget-modal');
      const toggles = modal.querySelectorAll('.day-toggle');

      // Set defaults
      let workDays = 62; // Mon-Fri
      let periodStartDay = 1;
      let amount = '';

      try {
        const res = await fetch('/api/budget');
        if (res.ok) {
          const data = await res.json();
          workDays = data.workDays;
          periodStartDay = data.periodStartDay;
          amount = data.amount;
        }
      } catch {}

      document.getElementById('budget-amount').value = amount;
      document.getElementById('budget-start-day').value = periodStartDay;

      toggles.forEach(btn => {
        const bit = parseInt(btn.getAttribute('data-bit'), 10);
        btn.classList.toggle('active', !!((workDays >> bit) & 1));
        btn.onclick = () => btn.classList.toggle('active');
      });

      document.getElementById('budget-error').style.display = 'none';
      document.getElementById('budget-error').textContent = '';
      modal.showModal();
    }

    async function saveBudget() {
      const modal = document.getElementById('budget-modal');
      const amount = parseFloat(document.getElementById('budget-amount').value);
      const periodStartDay = parseInt(document.getElementById('budget-start-day').value, 10);

      if (isNaN(amount) || amount < 0) {
        document.getElementById('budget-amount').focus();
        return;
      }

      let workDays = 0;
      modal.querySelectorAll('.day-toggle.active').forEach(btn => {
        const bit = parseInt(btn.getAttribute('data-bit'), 10);
        workDays |= (1 << bit);
      });

      const errorEl = document.getElementById('budget-error');
      try {
        const res = await fetch('/api/budget', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, workDays, periodStartDay }),
        });
        if (!res.ok) {
          errorEl.textContent = 'Save failed. Please try again.';
          errorEl.style.display = 'inline';
          return;
        }
        modal.close();
        refresh();
      } catch {
        errorEl.textContent = 'Save failed. Please try again.';
        errorEl.style.display = 'inline';
      }
    }`;

export function renderHTML(
  sessions: SessionStats[],
  summary: TokenSummary,
  costSummary: CostSummary,
  daily: DailyTokens[],
  dailyModel: DailyModelTokens[],
  toolGroups: ToolGroupSummary[],
  directories: string[] = [],
  selectedDir?: string,
  dailyCost: DailyTokens[] = [],
  dailyModelCost: DailyModelTokens[] = [],
  budgetStatus: BudgetStatus | null = null,
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
  <dialog id="budget-modal">
    <div class="modal-title">Budget Settings</div>
    <div class="modal-field">
      <label class="modal-label" for="budget-amount">Monthly Budget ($)</label>
      <input class="modal-input" type="number" id="budget-amount" min="0" step="0.01" placeholder="100.00">
    </div>
    <div class="modal-field">
      <label class="modal-label">Work Days</label>
      <div class="day-toggles">
        <button class="day-toggle" data-bit="1">Mo</button>
        <button class="day-toggle" data-bit="2">Di</button>
        <button class="day-toggle" data-bit="3">Mi</button>
        <button class="day-toggle" data-bit="4">Do</button>
        <button class="day-toggle" data-bit="5">Fr</button>
        <button class="day-toggle" data-bit="6">Sa</button>
        <button class="day-toggle" data-bit="0">So</button>
      </div>
    </div>
    <div class="modal-field">
      <label class="modal-label">Period</label>
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
        <span style="color:#8b949e">Starts day</span>
        <input class="modal-input" type="number" id="budget-start-day" min="1" max="28" value="1" style="width:60px">
        <span style="color:#8b949e">of the month &mdash; ends last day of month</span>
      </div>
    </div>
    <div class="modal-actions">
      <span id="budget-error" style="color:#f0883e;font-size:12px;display:none"></span>
      <button class="btn-cancel" onclick="document.getElementById('budget-modal').close()">Cancel</button>
      <button class="btn-save" onclick="saveBudget()">Save</button>
    </div>
  </dialog>
  <div class="header">
    <h1>OpenCode Usage Stats</h1>
    <div class="refresh-badge">
      <div class="refresh-dot"></div>
      <span>auto-refresh 5s</span>
      <span id="refresh-timing" class="refresh-timing"></span>
      <button class="gear-btn" onclick="openBudgetModal()" title="Budget settings">⚙</button>
    </div>
  </div>
  <div id="sessions">
    ${renderSessionsFragment(sessions, summary, costSummary, daily, dailyModel, toolGroups, directories, selectedDir, dailyCost, dailyModelCost, budgetStatus)}
  </div>
  <script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}
