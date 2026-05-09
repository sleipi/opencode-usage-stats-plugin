# opencode-usage-stats

Usage statistics tracking and dashboard plugin for [OpenCode](https://opencode.ai).

Tracks token usage, costs, model selection, and agent activity across sessions. Provides a browser-based dashboard for reviewing your usage.

## Features

- **Token tracking** — input, output, reasoning, and cache-read tokens per message
- **Session tracking** — titles, directories, timestamps, parent/child relationships
- **Agent tracking** — subagent types (explore, product-manager, software-architect, etc.) with per-agent token breakdowns
- **Cost tracking** — per-message cost as reported by the provider
- **Dashboard** — dark-themed browser UI at `localhost:3333` with auto-refresh
- **Token summary** — today, this week, this month, last month totals

## Requirements

- [Bun](https://bun.sh) runtime (uses `bun:sqlite` for zero-dependency SQLite)
- [OpenCode](https://opencode.ai) with plugin support

## Installation

```bash
git clone https://github.com/sleipi/opencode-usage-stats.git
cd opencode-usage-stats
bun install
```

### Symlink into OpenCode plugins

```bash
ln -s "$(pwd)/src/plugin.ts" ~/.config/opencode/plugins/opencode-usage-stats.ts
ln -s "$(pwd)/src/dashboard.ts" ~/.config/opencode/plugins/usage-stats-dashboard.ts
```

Restart OpenCode to load the plugin. The plugin starts tracking immediately.

## Dashboard

Start the dashboard manually:

```bash
bun run dashboard
```

Opens at [http://localhost:3333](http://localhost:3333).

The dashboard auto-refreshes every 5 seconds and shows:
- Token summary bar (Today / This Week / This Month / Last Month)
- Session cards with token breakdown and agent details
- Cache hit percentages with explanatory tooltips

## Data Storage

All data is stored in `~/.config/opencode/usage-stats.db` (SQLite). This file is not part of the repository.

Tables:
- `sessions` — session metadata (title, directory, parent_id, timestamps)
- `messages` — per-message token counts, model, provider, cost
- `tool_calls` — tool invocations with agent type tracking

## How It Works

The plugin hooks into OpenCode's `event` system:
- `session.created` / `session.updated` — tracks session metadata and parent/child relationships
- `message.updated` — captures token counts, model, provider, and cost per assistant message

Subagent tokens are aggregated into their parent session in the dashboard via `parent_id` linking.

## License

MIT
