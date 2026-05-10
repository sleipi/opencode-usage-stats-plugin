# AGENTS.md

## Runtime

Bun is required — the plugin uses `bun:sqlite` (zero-dependency SQLite). Node.js will not work.
This project is an OpenCode plugin and currently targets a single-user local system.

## Commands

- `bun install` — install deps
- `bun run dashboard` — start dashboard server on localhost:3333 (`--watch` auto-restarts on file changes)
- Port `3333` is also used by OpenCode itself; for local testing/dev, prefer a different port (for example: `PORT=3334 bun run dashboard`).
- For agent-driven testing, run dashboard commands in the background to avoid blocking the shell (for example: `PORT=3334 bun run dashboard &`).
- `bun test tests/unit` — run unit tests
- `bun test tests/e2e` or `bun run test:e2e` — run Playwright end-to-end tests

No linter or CI is configured.

## Architecture

Main files in `src/`:

- **`plugin.ts`** — OpenCode event plugin entrypoint; wires dependencies and hook handlers.
- **`context/session-context.ts`** — shared per-session context (agent/model/project tracking).
- **`handlers/`** — focused hook handlers (`chat-params`, `tool-execute`, `event`) and hook/event types.
- **`dashboard.ts`** — standalone HTTP server serving a browser dashboard with auto-refresh.

Data lives at `~/.config/opencode/usage-stats.db` (not in repo). Four tables: `sessions`, `messages`, `tool_calls`, `daily_usage`.

## Coding Standards

- Keep plugin logic SOLID and small: single-purpose modules, explicit boundaries, and no unnecessary abstractions.
- Prefer interfaces/types at OpenCode boundaries (hook inputs, event envelopes, context contracts) instead of `any`.
- Keep `plugin.ts` as composition root only; business logic belongs in `handlers/` and shared state in `context/`.
- Use dependency injection for external I/O boundaries (for example repository creation) to keep logic testable.
- Preserve telemetry-fault tolerance: hook handlers must not throw on persistence errors.
- Follow existing style: TypeScript, async handlers, explicit null handling, minimal comments.

## Test Requirements

- Every new behavior requires unit tests; all branches in new handler/context logic must be covered.
- For plugin/hook work, add focused unit tests for:
  - `SessionContext` read/write and fallback behavior
  - each handler (`chat.params`, `tool.execute.after`, `event`) including no-op and error-swallowing paths
  - event type guards in `src/handlers/types.ts`
- Keep tests deterministic and local (prefer doubles/stubs for repository interactions in handler tests).
- Run `bun test tests/unit` after changes and before handing off.
- When relevant UI/server behavior changes, also run Playwright tests.

## Installation quirk

Plugin is registered via symlinks into `~/.config/opencode/plugins/`, not via `opencode.json`. Both `plugin.ts` and `dashboard.ts` must be symlinked separately.

## Roadmap

`ROADMAP.md` tracks planned and completed work. Rules:

- All entries must be written in English.
- New items go to the bottom of **Planned**.
- When an item is done, move it to the top of **Completed** (newest first) and change `[ ]` to `[x]`.
