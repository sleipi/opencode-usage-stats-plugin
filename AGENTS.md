# AGENTS.md

## Runtime

Bun is required — the plugin uses `bun:sqlite` (zero-dependency SQLite). Node.js will not work.
This project is an OpenCode plugin and currently targets a single-user local system.

## Commands

- `bun install` — install deps
- `bun run dashboard` — start dashboard server on localhost:3333 (`--watch` auto-restarts on file changes)
- Port `3333` is also used by OpenCode itself; for local testing/dev, prefer a different port (for example: `PORT=3334 bun run dashboard`).
- For agent-driven testing, run dashboard commands in the background to avoid blocking the shell (for example: `PORT=3334 bun run dashboard &`).

No tests, linter, or CI are configured.

## Architecture

Two files in `src/`:

- **`plugin.ts`** — OpenCode event plugin. Hooks `session.created`, `session.updated`, `message.updated` to persist token/cost/agent data into SQLite.
- **`dashboard.ts`** — Standalone HTTP server serving a browser dashboard with auto-refresh. Reads from the same SQLite DB.

Data lives at `~/.config/opencode/usage-stats.db` (not in repo). Four tables: `sessions`, `messages`, `tool_calls`, `daily_usage`.

## Installation quirk

Plugin is registered via symlinks into `~/.config/opencode/plugins/`, not via `opencode.json`. Both `plugin.ts` and `dashboard.ts` must be symlinked separately.

## Roadmap

`ROADMAP.md` tracks planned and completed work. Rules:

- All entries must be written in English.
- New items go to the bottom of **Planned**.
- When an item is done, move it to the top of **Completed** (newest first) and change `[ ]` to `[x]`.
