# Daily Cost Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two cost bar charts to the dashboard left panel — "Daily Cost" (with 5-day avg line) below "Daily Token Usage", and "Daily Cost by Model" below "Daily Token Usage by Model".

**Architecture:** Extend data layer with two new query methods (cost history from rolled-up `daily_usage.cost_total`, and live model-cost from `messages.cost`), add two render functions mirroring existing token charts, then thread the new data arrays through service → route → template.

**Tech Stack:** Bun, TypeScript, SQLite (bun:sqlite), plain HTML string templates, Biome linter, `bun test` for unit tests.

## Global Constraints

- No new DB migrations — `daily_usage.cost_total` and `messages.cost` already exist.
- No new types — reuse `DailyTokens` (`{ date: string; total: number }`) and `DailyModelTokens` (`{ date: string; model: string; total: number }`) from existing imports.
- `fmtCost(n)` from `src/dashboard/templates/formatters.ts` must be used for all cost display (returns `"$0.00"`, `"$0.0234"`, or `"$1.23"`).
- Follow existing patterns exactly: `bun:test` for tests, `createSqliteRepos` + temp DB for repo integration tests, stub objects for service/template unit tests.
- Run `bun test tests/unit` after every commit to verify no regressions.
- Run `bun x tsc --noEmit` before final commit.

---

### Task 1: Extend DailyUsageRepo with cost history query

**Files:**
- Modify: `src/db/daily-usage/daily-usage-repo.ts`
- Modify: `src/db/daily-usage/sqlite-daily-usage-repo.ts`
- Modify: `tests/unit/sqlite-daily-usage-repo.test.ts`

**Interfaces:**
- Produces: `repos.dailyUsage.getHistoryUntilCost(dayExclusive: string, lookbackDays: number): DailyTokens[]`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/sqlite-daily-usage-repo.test.ts` inside the `describe` block, after the existing test:

```ts
test("getHistoryUntilCost returns cost_total for rolled-up days", () => {
  const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
  cleanupDirs.push(dir);
  const repos = createSqliteRepos(dbPath);
  const db = new Database(dbPath);

  db.prepare(
    "INSERT INTO sessions (session_id, first_seen, last_seen) VALUES (?, ?, ?)",
  ).run("s1", "2026-05-01 10:00:00", "2026-05-01 10:00:00");
  db.prepare(`
    INSERT INTO messages (session_id, message_id, role, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cost, timestamp)
    VALUES ('s1', 'm1', 'assistant', 100, 50, 10, 20, 0.25, '2026-05-01 12:00:00')
  `).run();
  db.close();

  repos.dailyUsage.recompute("2026-05-01", "2026-05-02");
  const history = repos.dailyUsage.getHistoryUntilCost("2026-05-03", 60);
  const row = history.find((r) => r.date === "2026-05-01");
  expect(row?.total).toBeCloseTo(0.25);

  repos.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/unit/sqlite-daily-usage-repo.test.ts
```

Expected: FAIL — `getHistoryUntilCost is not a function`

- [ ] **Step 3: Add method to DailyUsageRepo interface**

In `src/db/daily-usage/daily-usage-repo.ts`, add after `getHistoryUntil`:

```ts
import type { DailyTokens } from "../shared-types";

export interface DailyUsageRepo {
  recompute(fromDay: string, toDay: string): void;
  getHistoryUntil(dayExclusive: string, lookbackDays: number): DailyTokens[];
  getHistoryUntilCost(dayExclusive: string, lookbackDays: number): DailyTokens[];
}
```

- [ ] **Step 4: Implement in SqliteDailyUsageRepo**

In `src/db/daily-usage/sqlite-daily-usage-repo.ts`, add after `getHistoryUntil`:

```ts
getHistoryUntilCost(dayExclusive: string, lookbackDays: number): DailyTokens[] {
  return this.db
    .prepare(`
    SELECT day AS date, cost_total AS total
    FROM daily_usage
    WHERE day < ?
      AND day >= date('now', ?)
    ORDER BY day ASC
  `)
    .all(dayExclusive, `-${lookbackDays} days`) as DailyTokens[];
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun test tests/unit/sqlite-daily-usage-repo.test.ts
```

Expected: PASS (both tests)

- [ ] **Step 6: Commit**

```bash
git add src/db/daily-usage/daily-usage-repo.ts src/db/daily-usage/sqlite-daily-usage-repo.ts tests/unit/sqlite-daily-usage-repo.test.ts
git commit -m "feat: add getHistoryUntilCost to DailyUsageRepo"
```

---

### Task 2: Extend MessageRepo with cost query methods

**Files:**
- Modify: `src/db/message/message-repo.ts`
- Modify: `src/db/message/sqlite-message-repo.ts`
- Modify: `tests/unit/sqlite-message-repo.test.ts`

**Interfaces:**
- Consumes: `DailyTokens` from `../shared-types`, `DailyModelTokens` from `./message-repo`
- Produces:
  - `repos.messages.getTodayCost(today: string): DailyTokens`
  - `repos.messages.getDailyModelCost(): DailyModelTokens[]`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/sqlite-message-repo.test.ts` inside the `describe` block:

```ts
test("getTodayCost returns sum of cost for today", () => {
  const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
  cleanupDirs.push(dir);
  const repos = createSqliteRepos(dbPath);
  const today = new Date().toISOString().slice(0, 10);

  repos.messages.upsert({
    sessionId: "s1",
    messageId: "m1",
    role: "assistant",
    modelId: "model-a",
    providerId: "prov-a",
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0.05,
    agent: null,
  });

  const result = repos.messages.getTodayCost(today);
  expect(result.date).toBe(today);
  expect(result.total).toBeCloseTo(0.05);

  repos.close();
});

test("getDailyModelCost groups cost by date and model", () => {
  const { dir, dbPath } = createTempDbPath("opencode-usage-stats-repos-");
  cleanupDirs.push(dir);
  const repos = createSqliteRepos(dbPath);

  repos.messages.upsert({
    sessionId: "s1",
    messageId: "m1",
    role: "assistant",
    modelId: "sonnet",
    providerId: "anthropic",
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0.1,
    agent: null,
  });
  repos.messages.upsert({
    sessionId: "s1",
    messageId: "m2",
    role: "assistant",
    modelId: "sonnet",
    providerId: "anthropic",
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0.2,
    agent: null,
  });

  const result = repos.messages.getDailyModelCost();
  const today = new Date().toISOString().slice(0, 10);
  const row = result.find(
    (r) => r.date === today && r.model === "anthropic / sonnet",
  );
  expect(row?.total).toBeCloseTo(0.3);

  repos.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/unit/sqlite-message-repo.test.ts
```

Expected: FAIL — `getTodayCost is not a function`

- [ ] **Step 3: Add methods to MessageRepo interface**

In `src/db/message/message-repo.ts`, add two lines to the `MessageRepo` interface:

```ts
export interface MessageRepo {
  upsert(data: MessageData): void;
  getModeStats(): ModeRow[];
  getTokenSummary(): TokenSummary;
  getCostSummary(): CostSummary;
  getTodayTokens(today: string): DailyTokens;
  getTodayCost(today: string): DailyTokens;
  getDailyTokensByModel(): DailyModelTokens[];
  getDailyModelCost(): DailyModelTokens[];
  deleteOlderThan(cutoffDate: string): number;
}
```

- [ ] **Step 4: Implement getTodayCost in SqliteMessageRepo**

In `src/db/message/sqlite-message-repo.ts`:

Add `private readonly todayCostStmt;` to the class properties (after `todayTokensStmt`).

Add to the `constructor` body (after `this.todayTokensStmt = ...`):

```ts
this.todayCostStmt = this.db.prepare(`
  SELECT ? AS date,
         COALESCE(SUM(cost), 0) AS total
  FROM messages
  WHERE timestamp >= ? AND timestamp < date(?, '+1 day')
`);
```

Add method after `getTodayTokens`:

```ts
getTodayCost(today: string): DailyTokens {
  return this.todayCostStmt.get(today, today, today) as DailyTokens;
}
```

- [ ] **Step 5: Implement getDailyModelCost in SqliteMessageRepo**

Add method after `getDailyTokensByModel`:

```ts
getDailyModelCost(): DailyModelTokens[] {
  return this.db
    .prepare(`
    SELECT date(timestamp) AS date,
           COALESCE(provider_id, 'unknown') || ' / ' || COALESCE(model_id, 'unknown') AS model,
           COALESCE(SUM(cost), 0) AS total
    FROM messages
    WHERE timestamp >= date('now', '-60 days')
    GROUP BY date, model
    ORDER BY date ASC
  `)
    .all() as DailyModelTokens[];
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
bun test tests/unit/sqlite-message-repo.test.ts
```

Expected: PASS (all 3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/db/message/message-repo.ts src/db/message/sqlite-message-repo.ts tests/unit/sqlite-message-repo.test.ts
git commit -m "feat: add getTodayCost and getDailyModelCost to MessageRepo"
```

---

### Task 3: Extend DailyTokensService with cost methods

**Files:**
- Modify: `src/dashboard/services/daily-tokens-service.ts`
- Modify: `tests/unit/dashboard/daily-tokens-service.test.ts`

**Interfaces:**
- Consumes: `repos.messages.getTodayCost`, `repos.messages.getDailyModelCost`, `repos.dailyUsage.getHistoryUntilCost` (all from Tasks 1–2)
- Produces:
  - `dailyTokensService.getDailyCost(): DailyTokens[]`
  - `dailyTokensService.getDailyModelCost(): DailyModelTokens[]`

- [ ] **Step 1: Update stub repos in the test file**

The stub repos in `tests/unit/dashboard/daily-tokens-service.test.ts` must include the new methods or TypeScript will fail. Update `makeStubRepos` — add `getTodayCost` to the `messages` stub and `getHistoryUntilCost` to the `dailyUsage` stub, plus add an optional `todayCost` and `historyCost` override:

```ts
function makeStubRepos(
  overrides: Partial<{
    todayTokens: { date: string; total: number };
    todayCost: { date: string; total: number };
    history: { date: string; total: number }[];
    historyCost: { date: string; total: number }[];
    tokenSummary: {
      today: number;
      thisWeek: number;
      thisMonth: number;
      lastMonth: number;
    };
    dailyModel: { date: string; model: string; total: number }[];
    dailyModelCost: { date: string; model: string; total: number }[];
  }> = {},
): Repos {
  return {
    sessions: {
      getRootSessions: () => [],
      getChildSessions: () => [],
      getDistinctDirectories: () => [],
      upsert: () => {},
      upsertFull: () => {},
      deleteOrphaned: () => 0,
    },
    messages: {
      getModeStats: () => [],
      getTokenSummary: () =>
        overrides.tokenSummary ?? {
          today: 0,
          thisWeek: 0,
          thisMonth: 0,
          lastMonth: 0,
        },
      getTodayTokens: () =>
        overrides.todayTokens ?? {
          date: new Date().toISOString().slice(0, 10),
          total: 0,
        },
      getTodayCost: () =>
        overrides.todayCost ?? {
          date: new Date().toISOString().slice(0, 10),
          total: 0,
        },
      getDailyTokensByModel: () => overrides.dailyModel ?? [],
      getDailyModelCost: () => overrides.dailyModelCost ?? [],
      upsert: () => {},
      deleteOlderThan: () => 0,
      getCostSummary: () => ({
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
        lastMonth: 0,
      }),
    },
    toolCalls: {
      getAgentCalls: () => [],
      getToolUsageSummary: () => [],
      insert: () => {},
      deleteOlderThan: () => 0,
    },
    dailyUsage: {
      recompute: () => {},
      getHistoryUntil: () => overrides.history ?? [],
      getHistoryUntilCost: () => overrides.historyCost ?? [],
    },
    vacuum: () => {},
    close: () => {},
  };
}
```

- [ ] **Step 2: Write the failing tests**

Add to `tests/unit/dashboard/daily-tokens-service.test.ts` inside the `describe` block:

```ts
test("getDailyCost returns 60 days with gap filling", () => {
  const service = createDailyTokensService(makeStubRepos());
  const result = service.getDailyCost();
  expect(result).toHaveLength(60);
  expect(result[59]!.date).toBe(new Date().toISOString().slice(0, 10));
});

test("getDailyCost merges today cost with history", () => {
  const today = new Date().toISOString().slice(0, 10);
  const service = createDailyTokensService(
    makeStubRepos({
      todayCost: { date: today, total: 0.5 },
      historyCost: [{ date: today, total: 0.1 }],
    }),
  );
  const result = service.getDailyCost();
  const todayEntry = result.find((d) => d.date === today);
  expect(todayEntry!.total).toBeCloseTo(0.5);
});

test("getDailyModelCost delegates to repo", () => {
  const data = [{ date: "2025-01-01", model: "test", total: 0.05 }];
  const service = createDailyTokensService(
    makeStubRepos({ dailyModelCost: data }),
  );
  expect(service.getDailyModelCost()).toEqual(data);
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bun test tests/unit/dashboard/daily-tokens-service.test.ts
```

Expected: FAIL — `getDailyCost is not a function`

- [ ] **Step 4: Add methods to DailyTokensService interface**

In `src/dashboard/services/daily-tokens-service.ts`, update the interface:

```ts
export interface DailyTokensService {
  getDailyTokens(): DailyTokens[];
  getDailyTokensByModel(): DailyModelTokens[];
  getDailyCost(): DailyTokens[];
  getDailyModelCost(): DailyModelTokens[];
  getTokenSummary(): TokenSummary;
  getCostSummary(): CostSummary;
}
```

- [ ] **Step 5: Implement the new methods**

In `src/dashboard/services/daily-tokens-service.ts`, add inside the returned object in `createDailyTokensService`:

```ts
getDailyCost(): DailyTokens[] {
  const today = new Date().toISOString().slice(0, 10);
  const todayRow = repos.messages.getTodayCost(today);
  const historyRows = repos.dailyUsage.getHistoryUntilCost(today, 60);

  const dataMap = new Map<string, number>();
  for (const row of historyRows) dataMap.set(row.date, row.total);
  dataMap.set(todayRow.date, todayRow.total);

  const result: DailyTokens[] = [];
  for (let i = 59; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, total: dataMap.get(key) ?? 0 });
  }
  return result;
},

getDailyModelCost(): DailyModelTokens[] {
  return repos.messages.getDailyModelCost();
},
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
bun test tests/unit/dashboard/daily-tokens-service.test.ts
```

Expected: PASS (all 7 tests)

- [ ] **Step 7: Commit**

```bash
git add src/dashboard/services/daily-tokens-service.ts tests/unit/dashboard/daily-tokens-service.test.ts
git commit -m "feat: add getDailyCost and getDailyModelCost to DailyTokensService"
```

---

### Task 4: Add renderDailyCostChart template

**Files:**
- Modify: `src/dashboard/templates/daily-chart.ts`
- Modify: `tests/unit/dashboard/daily-chart.test.ts`

**Interfaces:**
- Consumes: `DailyTokens` from `../../db/shared-types`, `fmtCost` from `./formatters`
- Produces: `renderDailyCostChart(daily: DailyTokens[]): string`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/dashboard/daily-chart.test.ts`:

```ts
import { renderDailyChart, renderDailyCostChart } from "../../../src/dashboard/templates/daily-chart";

describe("renderDailyCostChart", () => {
  test("renders 60 chart columns", () => {
    const html = renderDailyCostChart([]);
    const count = (html.match(/class="chart-col"/g) || []).length;
    expect(count).toBe(60);
  });

  test("renders title and legend", () => {
    const html = renderDailyCostChart([]);
    expect(html).toContain("Daily Cost (last 60 days)");
    expect(html).toContain("Daily cost");
    expect(html).toContain("5-day avg");
  });

  test("renders cost label using fmtCost", () => {
    const today = new Date().toISOString().slice(0, 10);
    const html = renderDailyCostChart([{ date: today, total: 1.5 }]);
    expect(html).toContain("$1.50");
  });

  test("handles all-zero data without errors", () => {
    const html = renderDailyCostChart([{ date: "2025-01-01", total: 0 }]);
    expect(html).toContain("chart-container");
  });

  test("renders rolling average polyline", () => {
    const html = renderDailyCostChart([]);
    expect(html).toContain("polyline");
    expect(html).toContain("chart-avg-line");
  });
});
```

Note: update the import at the top of the file to include `renderDailyCostChart`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/unit/dashboard/daily-chart.test.ts
```

Expected: FAIL — `renderDailyCostChart is not a function`

- [ ] **Step 3: Implement renderDailyCostChart**

Add to `src/dashboard/templates/daily-chart.ts` (after `renderDailyChart`):

```ts
import type { DailyTokens } from "../../db/shared-types";
import { fmt, fmtCost } from "./formatters";

// ... existing renderDailyChart ...

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
```

Important: update the import line at the top of `daily-chart.ts` to add `fmtCost`:

```ts
import { fmt, fmtCost } from "./formatters";
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/unit/dashboard/daily-chart.test.ts
```

Expected: PASS (all 10 tests — 5 existing + 5 new)

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/templates/daily-chart.ts tests/unit/dashboard/daily-chart.test.ts
git commit -m "feat: add renderDailyCostChart template"
```

---

### Task 5: Add renderDailyModelCostChart template

**Files:**
- Modify: `src/dashboard/templates/model-chart.ts`
- Modify: `tests/unit/dashboard/model-chart.test.ts`

**Interfaces:**
- Consumes: `DailyModelTokens` from `../../db/message/message-repo`, `esc`, `fmtCost` from `./formatters`, `MODEL_COLORS` (already exported from this file)
- Produces: `renderDailyModelCostChart(modelData: DailyModelTokens[]): string`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/dashboard/model-chart.test.ts`:

```ts
import {
  MODEL_COLORS,
  renderDailyModelChart,
  renderDailyModelCostChart,
} from "../../../src/dashboard/templates/model-chart";

// ... existing tests ...

describe("renderDailyModelCostChart", () => {
  test("renders title", () => {
    const html = renderDailyModelCostChart([]);
    expect(html).toContain("Daily Cost by Model (last 60 days)");
  });

  test("renders stacked segments for models", () => {
    const today = new Date().toISOString().slice(0, 10);
    const html = renderDailyModelCostChart([
      { date: today, model: "claude-sonnet", total: 0.5 },
      { date: today, model: "gpt-4o", total: 0.3 },
    ]);
    expect(html).toContain("claude-sonnet");
    expect(html).toContain("gpt-4o");
    expect(html).toContain("model-bar-seg");
  });

  test("uses fmtCost in tooltips", () => {
    const today = new Date().toISOString().slice(0, 10);
    const html = renderDailyModelCostChart([
      { date: today, model: "test-model", total: 0.05 },
    ]);
    expect(html).toContain("$0.05");
  });

  test("assigns colors from MODEL_COLORS", () => {
    const today = new Date().toISOString().slice(0, 10);
    const html = renderDailyModelCostChart([
      { date: today, model: "model-a", total: 0.1 },
    ]);
    expect(html).toContain(MODEL_COLORS[0]!);
  });

  test("renders legend entries", () => {
    const today = new Date().toISOString().slice(0, 10);
    const html = renderDailyModelCostChart([
      { date: today, model: "test-model", total: 0.1 },
    ]);
    expect(html).toContain("legend-item");
    expect(html).toContain("test-model");
  });
});
```

Note: update the import at the top to include `renderDailyModelCostChart`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/unit/dashboard/model-chart.test.ts
```

Expected: FAIL — `renderDailyModelCostChart is not a function`

- [ ] **Step 3: Implement renderDailyModelCostChart**

In `src/dashboard/templates/model-chart.ts`, update the import line (keep `fmt` for the existing `renderDailyModelChart`):

```ts
import { esc, fmt, fmtCost } from "./formatters";
```

Then add after `renderDailyModelChart`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/unit/dashboard/model-chart.test.ts
```

Expected: PASS (all 9 tests — 4 existing + 5 new)

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/templates/model-chart.ts tests/unit/dashboard/model-chart.test.ts
git commit -m "feat: add renderDailyModelCostChart template"
```

---

### Task 6: Wire cost data through routes and templates

**Files:**
- Modify: `src/dashboard/templates/sessions-fragment.ts`
- Modify: `src/dashboard/templates/page-template.ts`
- Modify: `src/dashboard/routes/stats-route.ts`
- Modify: `src/dashboard/routes/page-route.ts`
- Modify: `tests/unit/dashboard/sessions-fragment.test.ts`
- Modify: `tests/unit/dashboard/routes.test.ts`
- Modify: `tests/unit/dashboard/page-template.test.ts`

**Interfaces:**
- Consumes: `renderDailyCostChart` from `./daily-chart`, `renderDailyModelCostChart` from `./model-chart`, `dailyTokens.getDailyCost()`, `dailyTokens.getDailyModelCost()`
- Produces: cost charts rendered in left panel of dashboard

- [ ] **Step 1: Update stubs in routes.test.ts**

In `tests/unit/dashboard/routes.test.ts`, update `makeStubDailyTokens`:

```ts
function makeStubDailyTokens(): DailyTokensService {
  return {
    getDailyTokens: () => [],
    getDailyTokensByModel: () => [],
    getDailyCost: () => [],
    getDailyModelCost: () => [],
    getTokenSummary: () => ({
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      lastMonth: 0,
    }),
    getCostSummary: () => ({
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      lastMonth: 0,
    }),
  };
}
```

- [ ] **Step 2: Run routes tests to verify they still pass after stub update**

```bash
bun test tests/unit/dashboard/routes.test.ts
```

Expected: TypeScript compilation error until we update the interface in step 3, but once interface is updated all tests pass.

- [ ] **Step 3: Update sessions-fragment.ts**

In `src/dashboard/templates/sessions-fragment.ts`:

Update imports:

```ts
import { renderDailyCostChart } from "./daily-chart";
import { renderDailyModelCostChart } from "./model-chart";
```

Update function signature (add two optional params at the end):

```ts
export function renderSessionsFragment(
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
): string {
```

Update the render calls and left panel:

```ts
const bar = renderStatsBar(summary, costSummary);
const chart = renderDailyChart(daily);
const costChart = renderDailyCostChart(dailyCost);
const modelChart = renderDailyModelChart(dailyModel);
const modelCostChart = renderDailyModelCostChart(dailyModelCost);
const toolUsage = renderToolUsage(toolGroups);

const leftPanel = `
  <div class="left-panel">
    ${bar}
    <hr class="section-divider">
    ${chart}
    ${costChart}
    ${modelChart}
    ${modelCostChart}
    ${toolUsage}
  </div>`;
```

- [ ] **Step 4: Add tests for sessions-fragment cost charts**

Add to `tests/unit/dashboard/sessions-fragment.test.ts`:

```ts
test("renders daily cost chart", () => {
  const today = new Date().toISOString().slice(0, 10);
  const html = renderSessionsFragment(
    [],
    summary,
    costSummary,
    [],
    [],
    [],
    [],
    undefined,
    [{ date: today, total: 1.5 }],
    [],
  );
  expect(html).toContain("Daily Cost (last 60 days)");
});

test("renders daily model cost chart", () => {
  const today = new Date().toISOString().slice(0, 10);
  const html = renderSessionsFragment(
    [],
    summary,
    costSummary,
    [],
    [],
    [],
    [],
    undefined,
    [],
    [{ date: today, model: "test-model", total: 0.1 }],
  );
  expect(html).toContain("Daily Cost by Model (last 60 days)");
});
```

- [ ] **Step 5: Run sessions-fragment tests**

```bash
bun test tests/unit/dashboard/sessions-fragment.test.ts
```

Expected: PASS (all 7 tests)

- [ ] **Step 6: Update page-template.ts**

In `src/dashboard/templates/page-template.ts`, update `renderHTML` signature and the `renderSessionsFragment` call:

```ts
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
): string {
  return `<!DOCTYPE html>
...
  <div id="sessions">
    ${renderSessionsFragment(sessions, summary, costSummary, daily, dailyModel, toolGroups, directories, selectedDir, dailyCost, dailyModelCost)}
  </div>
...`;
}
```

Keep all existing HTML structure intact — only the function signature and the `renderSessionsFragment` call arguments change.

- [ ] **Step 7: Update stats-route.ts**

In `src/dashboard/routes/stats-route.ts`, add two lines after `const dailyModel = ...`:

```ts
const dailyCost = dailyTokens.getDailyCost();
const dailyModelCost = dailyTokens.getDailyModelCost();
```

Update the `renderSessionsFragment` call:

```ts
const html = renderSessionsFragment(
  sessions,
  summary,
  costSummary,
  daily,
  dailyModel,
  toolGroups,
  directories,
  dirFilter,
  dailyCost,
  dailyModelCost,
);
```

- [ ] **Step 8: Update page-route.ts**

In `src/dashboard/routes/page-route.ts`, add two lines after `const dailyModel = ...`:

```ts
const dailyCost = dailyTokens.getDailyCost();
const dailyModelCost = dailyTokens.getDailyModelCost();
```

Update the `renderHTML` call:

```ts
return new Response(
  renderHTML(
    sessions,
    summary,
    costSummary,
    daily,
    dailyModel,
    toolGroups,
    directories,
    dirFilter,
    dailyCost,
    dailyModelCost,
  ),
  {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  },
);
```

- [ ] **Step 9: Run full unit test suite**

```bash
bun test tests/unit
```

Expected: All tests pass, no TypeScript errors.

- [ ] **Step 10: Run typecheck**

```bash
bun x tsc --noEmit
```

Expected: no errors

- [ ] **Step 11: Commit**

```bash
git add src/dashboard/templates/sessions-fragment.ts src/dashboard/templates/page-template.ts src/dashboard/routes/stats-route.ts src/dashboard/routes/page-route.ts tests/unit/dashboard/sessions-fragment.test.ts tests/unit/dashboard/routes.test.ts tests/unit/dashboard/page-template.test.ts
git commit -m "feat: wire daily cost charts into dashboard"
```
