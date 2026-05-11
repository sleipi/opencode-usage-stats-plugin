# Roadmap

## Planned

## Completed

- [x] Add comprehensive end-to-end tests for dashboard
- [x] Auto-set npm version from release tag in CI publish workflow
- [x] Optimize dashboard refresh performance (>500ms to ~140ms)
- [x] Auto-start dashboard with openCode and add config file loading
- [x] Publish as npm package (`@sleipi/opencode-usage-stats`) with bin entrypoint for dashboard
- [x] Refactor dashboard into SOLID modules with DI, separated templates, services, and routes
- [x] Refactor plugin hook processing into explicit interfaces and focused handlers (SOLID)
- [x] Introduce Playwright end-to-end tests for dashboard rendering and stats endpoint
- [x] Introduce Bun unit tests for plugin database logic and dashboard utility rendering
- [x] Track and display Plan/Build mode breakdown per session (tokens, cost, message count)
- [x] Show working directory in session view
- [x] Highlight active session cards by recency
- [x] Add directory filter dropdown to dashboard sessions panel
