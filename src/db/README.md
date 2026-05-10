# Database Layer

This folder contains the persistence layer for OpenCode usage telemetry.

## Goals

- Keep each repository focused on one aggregate/table concern.
- Keep SQLite-specific details behind repository interfaces.
- Keep the plugin and handlers independent from SQL implementation details.

## Structure

- `sqlite-repository.ts`
  - Composition root for the DB layer.
  - Opens the SQLite connection, applies migrations (or readonly schema checks), and wires repository implementations.
  - Exposes `createSqliteRepos()` and `gcOldData()`.
- `repos.ts`
  - Shared aggregate contract for all repositories (`Repos`).
- `shared-types.ts`
  - Shared cross-repo row/value types.
- `session/`
  - `session-repo.ts`: session repository contract and types.
  - `sqlite-session-repo.ts`: SQLite implementation for session operations.
- `message/`
  - `message-repo.ts`: message repository contract and types.
  - `sqlite-message-repo.ts`: SQLite implementation for message operations.
- `tool-call/`
  - `tool-call-repo.ts`: tool-call repository contract and types.
  - `sqlite-tool-call-repo.ts`: SQLite implementation for tool-call operations.
- `daily-usage/`
  - `daily-usage-repo.ts`: daily usage repository contract.
  - `sqlite-daily-usage-repo.ts`: SQLite implementation for daily usage aggregation.

## Dependency Boundaries

- `plugin.ts`, `handlers/`, and `dashboard.ts` depend on `Repos` and repo interfaces, not on SQL statements.
- Repository implementations depend on `bun:sqlite` and SQL details.
- The factory (`createSqliteRepos`) is the only place that should instantiate SQLite repo classes.

## SOLID Notes

- Single Responsibility: each SQLite repo class handles one repository concern.
- Open/Closed: behavior extensions should happen by adding methods/classes, not expanding unrelated repositories.
- Liskov Substitution: handlers use interface contracts and can be tested with doubles.
- Interface Segregation: repository interfaces are split by use-case area.
- Dependency Inversion: high-level modules depend on `Repos` contracts, not concrete SQLite classes.

## Testing Strategy

- Unit tests for handlers/context use repository doubles.
- Repository tests use real temporary SQLite files and migrations.
- Current repository test files:
  - `tests/unit/sqlite-repository.test.ts`
  - `tests/unit/sqlite-session-repo.test.ts`
  - `tests/unit/sqlite-message-repo.test.ts`
  - `tests/unit/sqlite-tool-call-repo.test.ts`
  - `tests/unit/sqlite-daily-usage-repo.test.ts`
