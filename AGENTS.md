# AGENTS.md

## Runtime

Bun is required — the plugin uses `bun:sqlite` (zero-dependency SQLite). Node.js will not work.

## Commands

- `bun install` — install deps
- `bun run dashboard` — start dashboard server on localhost:3333

No tests, linter, or CI are configured.

## Architecture

Two files in `src/`:

- **`plugin.ts`** — OpenCode event plugin. Hooks `session.created`, `session.updated`, `message.updated` to persist token/cost/agent data into SQLite.
- **`dashboard.ts`** — Standalone HTTP server serving a browser dashboard with auto-refresh. Reads from the same SQLite DB.

Data lives at `~/.config/opencode/usage-stats.db` (not in repo). Three tables: `sessions`, `messages`, `tool_calls`.

## Installation quirk

Plugin is registered via symlinks into `~/.config/opencode/plugins/`, not via `opencode.json`. Both `plugin.ts` and `dashboard.ts` must be symlinked separately.

## Roadmap

`ROADMAP.md` tracks planned and completed work. Rules:

- All entries must be written in English.
- New items go to the bottom of **Planned**.
- When an item is done, move it to the top of **Completed** (newest first) and change `[ ]` to `[x]`.
