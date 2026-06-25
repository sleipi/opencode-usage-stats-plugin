# Daily Cost Charts

**Date:** 2026-06-25
**Status:** Approved

## Summary

Add two cost charts to the dashboard left panel, mirroring the existing token charts:

1. **Daily Cost** — bar chart with 5-day moving average, below "Daily Token Usage"
2. **Daily Cost by Model** — stacked bar chart, below "Daily Token Usage by Model"

No schema changes. No new types. Reuses `DailyTokens` and `DailyModelTokens` shapes throughout.

## Data Layer

### `DailyUsageRepo` (`src/db/daily-usage/`)

Add method to interface and implementation:

```ts
getHistoryUntilCost(dayExclusive: string, lookbackDays: number): DailyTokens[]
```

SQL reads `cost_total` instead of `tokens_total` from the `daily_usage` table. Same WHERE clause as `getHistoryUntil`.

### `MessageRepo` + `SqliteMessageRepo` (`src/db/message/`)

Add two methods:

```ts
getTodayCost(today: string): DailyTokens
// SELECT ? AS date, COALESCE(SUM(cost), 0) AS total FROM messages WHERE timestamp >= ? AND timestamp < date(?, '+1 day')

getDailyModelCost(): DailyModelTokens[]
// Same query as getDailyTokensByModel() but SUM(cost) AS total instead of token sum
// Returns { date, model, total } where total is cost in dollars
```

### `DailyTokensService` (`src/dashboard/services/daily-tokens-service.ts`)

Add two methods to interface and implementation:

```ts
getDailyCost(): DailyTokens[]
// Combines: getHistoryUntilCost(today, 60) + getTodayCost(today)
// Same merge logic as getDailyTokens()

getDailyModelCost(): DailyModelTokens[]
// Delegates to repos.messages.getDailyModelCost()
```

## Template Layer

### `daily-chart.ts` (`src/dashboard/templates/`)

Add `renderDailyCostChart(daily: DailyTokens[]): string`

- Same structure as `renderDailyChart`
- Bar label: `fmtCost(d.total)` compact — show value if `d.total > 0` (e.g. `$0.05`, `$1.23`)
- Tooltip: `${tooltipDate}<br>${fmtCost(d.total)}`
- 5-day moving average polyline (same logic as token chart)
- Title: `"Daily Cost (last 60 days)"`
- Legend: `"Daily cost"` + `"5-day avg"`

### `model-chart.ts` (`src/dashboard/templates/`)

Add `renderDailyModelCostChart(modelData: DailyModelTokens[]): string`

- Same structure as `renderDailyModelChart`
- Tooltip per model: `${fmtCost(val)}` instead of `${fmt(val)}`
- Stacked bars use same `MODEL_COLORS`
- Title: `"Daily Cost by Model (last 60 days)"`

## Wiring

### `sessions-fragment.ts`

- Accept two new params: `dailyCost: DailyTokens[]`, `dailyModelCost: DailyModelTokens[]`
- Render `renderDailyCostChart(dailyCost)` directly after `renderDailyChart`
- Render `renderDailyModelCostChart(dailyModelCost)` directly after `renderDailyModelChart`

### `stats-route.ts`

- Call `dailyTokens.getDailyCost()` and `dailyTokens.getDailyModelCost()`
- Pass to `renderSessionsFragment`

### `page-template.ts`

- Add `dailyCost: DailyTokens[]` and `dailyModelCost: DailyModelTokens[]` to `renderHTML` signature
- Pass through to `renderSessionsFragment`

## Out of Scope

- No changes to `daily_usage` schema (cost already stored)
- No new DB migrations
- No changes to stats bar
