import type { DailyModelTokens } from "../../db/message/message-repo";
import { esc, fmt, fmtCost } from "./formatters";

export const MODEL_COLORS = [
  "#58a6ff",
  "#3fb950",
  "#d2a8ff",
  "#f0883e",
  "#f85149",
  "#79c0ff",
  "#56d364",
  "#e3b341",
  "#bc8cff",
  "#ff7b72",
];

export function renderDailyModelChart(modelData: DailyModelTokens[]): string {
  const modelTotals = new Map<string, number>();
  for (const d of modelData) {
    modelTotals.set(d.model, (modelTotals.get(d.model) ?? 0) + d.total);
  }
  const models = [...modelTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([m]) => m);

  const colorMap = new Map<string, string>();
  for (const [i, m] of models.entries()) {
    colorMap.set(m, MODEL_COLORS[i % MODEL_COLORS.length]!);
  }

  const dataMap = new Map<string, Map<string, number>>();
  for (const d of modelData) {
    if (!dataMap.has(d.date)) dataMap.set(d.date, new Map());
    dataMap.get(d.date)?.set(d.model, d.total);
  }

  const days: { date: string; byModel: Map<string, number>; total: number }[] =
    [];
  for (let i = 59; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const key = dt.toISOString().slice(0, 10);
    const byModel = dataMap.get(key) ?? new Map();
    const total = [...byModel.values()].reduce((s, v) => s + v, 0);
    days.push({ date: key, byModel, total });
  }

  const max = Math.max(...days.map((d) => d.total), 1);

  const bars = days
    .map((d) => {
      const dateObj = new Date(`${d.date}T00:00:00`);
      const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });
      const day = String(dateObj.getDate()).padStart(2, "0");
      const month = dateObj.toLocaleDateString("en-US", { month: "short" });
      const tooltipDate = `${weekday}, ${day} ${month}`;

      const segments = models
        .map((m) => {
          const val = d.byModel.get(m) ?? 0;
          if (val === 0) return "";
          const pct = (val / max) * 100;
          const color = colorMap.get(m)!;
          return `<div class="model-bar-seg" style="height:${pct}%;background:${color}"></div>`;
        })
        .join("");

      const tooltipLines = models
        .filter((m) => (d.byModel.get(m) ?? 0) > 0)
        .map((m) => {
          const color = colorMap.get(m)!;
          return `<span style="color:${color}">\u25A0</span> ${esc(m)}: ${fmt(d.byModel.get(m)!)}`;
        })
        .join("<br>");

      return `
      <div class="chart-col">
        <div class="model-bar-stack" style="height:${max > 0 && d.total > 0 ? Math.max(1, Math.round((d.total / max) * 100)) : 0}%">
          ${segments}
        </div>
        <div class="chart-tooltip">${tooltipDate}<br>${tooltipLines}</div>
      </div>`;
    })
    .join("");

  const legend = models
    .map((m) => {
      const color = colorMap.get(m)!;
      return `<span class="legend-item"><span class="legend-bar" style="background:${color}"></span>${esc(m)}</span>`;
    })
    .join("");

  return `
    <div class="daily-chart">
      <div class="chart-title">Daily Token Usage by Model (last 60 days)</div>
      <div class="chart-container">
        ${bars}
      </div>
      <div class="chart-legend">
        ${legend}
      </div>
    </div>`;
}

export function renderDailyModelCostChart(modelData: DailyModelTokens[]): string {
  const modelTotals = new Map<string, number>();
  for (const d of modelData) {
    modelTotals.set(d.model, (modelTotals.get(d.model) ?? 0) + d.total);
  }
  const models = [...modelTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([m]) => m);

  const colorMap = new Map<string, string>();
  for (const [i, m] of models.entries()) {
    colorMap.set(m, MODEL_COLORS[i % MODEL_COLORS.length]!);
  }

  const dataMap = new Map<string, Map<string, number>>();
  for (const d of modelData) {
    if (!dataMap.has(d.date)) dataMap.set(d.date, new Map());
    dataMap.get(d.date)?.set(d.model, d.total);
  }

  const days: { date: string; byModel: Map<string, number>; total: number }[] =
    [];
  for (let i = 59; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const key = dt.toISOString().slice(0, 10);
    const byModel = dataMap.get(key) ?? new Map();
    const total = [...byModel.values()].reduce((s, v) => s + v, 0);
    days.push({ date: key, byModel, total });
  }

  const max = Math.max(...days.map((d) => d.total), 1);

  const bars = days
    .map((d) => {
      const dateObj = new Date(`${d.date}T00:00:00`);
      const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });
      const day = String(dateObj.getDate()).padStart(2, "0");
      const month = dateObj.toLocaleDateString("en-US", { month: "short" });
      const tooltipDate = `${weekday}, ${day} ${month}`;

      const segments = models
        .map((m) => {
          const val = d.byModel.get(m) ?? 0;
          if (val === 0) return "";
          const pct = (val / max) * 100;
          const color = colorMap.get(m)!;
          return `<div class="model-bar-seg" style="height:${pct}%;background:${color}"></div>`;
        })
        .join("");

      const tooltipLines = models
        .filter((m) => (d.byModel.get(m) ?? 0) > 0)
        .map((m) => {
          const color = colorMap.get(m)!;
          return `<span style="color:${color}">■</span> ${esc(m)}: ${fmtCost(d.byModel.get(m)!)}`;
        })
        .join("<br>");

      return `
      <div class="chart-col">
        <div class="model-bar-stack" style="height:${max > 0 && d.total > 0 ? Math.max(1, Math.round((d.total / max) * 100)) : 0}%">
          ${segments}
        </div>
        <div class="chart-tooltip">${tooltipDate}<br>${tooltipLines}</div>
      </div>`;
    })
    .join("");

  const legend = models
    .map((m) => {
      const color = colorMap.get(m)!;
      return `<span class="legend-item"><span class="legend-bar" style="background:${color}"></span>${esc(m)}</span>`;
    })
    .join("");

  return `
    <div class="daily-chart">
      <div class="chart-title">Daily Cost by Model (last 60 days)</div>
      <div class="chart-container">
        ${bars}
      </div>
      <div class="chart-legend">
        ${legend}
      </div>
    </div>`;
}
