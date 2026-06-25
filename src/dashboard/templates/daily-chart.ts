import type { DailyTokens } from "../../db/shared-types";
import { fmt, fmtCost } from "./formatters";

export function renderDailyChart(daily: DailyTokens[]): string {
  const dataMap = new Map<string, number>();
  for (const d of daily) dataMap.set(d.date, d.total);

  const days: { date: string; total: number }[] = [];
  for (let i = 59; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, total: dataMap.get(key) ?? 0 });
  }

  const max = Math.max(...days.map((d) => d.total));

  const bars = days
    .map((d) => {
      const pct =
        max > 0 && d.total > 0
          ? Math.max(1, Math.round((d.total / max) * 100))
          : 0;
      const dateObj = new Date(`${d.date}T00:00:00`);
      const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });
      const day = String(dateObj.getDate()).padStart(2, "0");
      const month = dateObj.toLocaleDateString("en-US", { month: "short" });
      const tooltipDate = `${weekday}, ${day} ${month}`;
      const tooltipTokens = fmt(d.total);
      return `
      <div class="chart-col">
        ${d.total > 0 ? `<div class="chart-value">${d.total >= 1000 ? `${Math.round(d.total / 1000)}k` : d.total}</div>` : ""}
        <div class="chart-bar" style="height: ${pct}%"></div>
        <div class="chart-tooltip">${tooltipDate}<br>${tooltipTokens} tokens</div>
      </div>`;
    })
    .join("");

  const avgPoints: { x: number; y: number }[] = [];
  for (let i = 0; i < days.length; i++) {
    const window = days.slice(Math.max(0, i - 4), i + 1);
    const avg = window.reduce((s, d) => s + d.total, 0) / window.length;
    const xPct = ((i + 0.5) / days.length) * 100;
    const yPct = max > 0 ? 100 - (avg / max) * 100 : 100;
    avgPoints.push({ x: xPct, y: yPct });
  }
  const polyline = avgPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return `
    <div class="daily-chart">
      <div class="chart-title">Daily Token Usage (last 60 days)</div>
      <div class="chart-container">
        ${bars}
        <svg class="chart-avg-line" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline points="${polyline}" fill="none" stroke="#f0883e" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
        </svg>
      </div>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-bar"></span>Daily tokens</span>
        <span class="legend-item"><span class="legend-line"></span>5-day avg</span>
      </div>
    </div>`;
}

export function renderDailyCostChart(daily: DailyTokens[]): string {
  const dataMap = new Map<string, number>();
  for (const d of daily) dataMap.set(d.date, d.total);

  const days: { date: string; total: number }[] = [];
  for (let i = 59; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, total: dataMap.get(key) ?? 0 });
  }

  const max = Math.max(...days.map((d) => d.total));

  const bars = days
    .map((d) => {
      const pct =
        max > 0 && d.total > 0
          ? Math.max(1, Math.round((d.total / max) * 100))
          : 0;
      const dateObj = new Date(`${d.date}T00:00:00`);
      const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });
      const day = String(dateObj.getDate()).padStart(2, "0");
      const month = dateObj.toLocaleDateString("en-US", { month: "short" });
      const tooltipDate = `${weekday}, ${day} ${month}`;
      return `
      <div class="chart-col">
        ${d.total > 0 ? `<div class="chart-value">${fmtCost(d.total)}</div>` : ""}
        <div class="chart-bar" style="height: ${pct}%"></div>
        <div class="chart-tooltip">${tooltipDate}<br>${fmtCost(d.total)}</div>
      </div>`;
    })
    .join("");

  const avgPoints: { x: number; y: number }[] = [];
  for (let i = 0; i < days.length; i++) {
    const window = days.slice(Math.max(0, i - 4), i + 1);
    const avg = window.reduce((s, d) => s + d.total, 0) / window.length;
    const xPct = ((i + 0.5) / days.length) * 100;
    const yPct = max > 0 ? 100 - (avg / max) * 100 : 100;
    avgPoints.push({ x: xPct, y: yPct });
  }
  const polyline = avgPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return `
    <div class="daily-chart">
      <div class="chart-title">Daily Cost (last 60 days)</div>
      <div class="chart-container">
        ${bars}
        <svg class="chart-avg-line" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline points="${polyline}" fill="none" stroke="#f0883e" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
        </svg>
      </div>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-bar"></span>Daily cost</span>
        <span class="legend-item"><span class="legend-line"></span>5-day avg</span>
      </div>
    </div>`;
}
