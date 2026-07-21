# Changelog

All notable changes to Dashclaw are documented here.

## [0.1.0] - 2026-07-21

### Added

- Real-time OpenClaw Gateway observability for agents, sessions, tasks, cron,
  approvals, nodes, and timeline events.
- SQLite-backed bounded runtime history and audit logging.
- Guarded administrative RPCs with allowlists, confirmations, read-only mode,
  session attribution, and output redaction.
- Operational dashboards, task/session drilldowns, work graphs, and fake
  Gateway scenarios for local evaluation.
- Supply-chain CI, dependency auditing, browser bundle credential checks, and
  Playwright coverage.

### Security

- Kept dashboard and Gateway credentials server-side.
- Removed reusable credentials from event-stream URLs.
- Enforced secure remote Gateway transport by default.
- Added bounded parsing, persistence, streaming, and browser validation.
- Protected local runtime data and minimized unauthenticated health output.

[0.1.0]: https://github.com/savva312/dashclaw/releases/tag/v0.1.0
