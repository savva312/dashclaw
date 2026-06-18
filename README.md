# Dashclaw

Agent OS runtime cockpit for OpenClaw. Dashclaw connects to a local OpenClaw Gateway over the official WebSocket protocol and provides real-time observability, persistent timeline history, and guarded admin controls.

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm build

# Terminal 1 — server (reads repo-root .env)
pnpm --filter @dashclaw/server dev

# Terminal 2 — web UI (reads repo-root .env)
pnpm --filter @dashclaw/web dev
```

Open http://localhost:5173. If `DASHCLAW_TOKEN` is set in `.env`, set `VITE_DASHCLAW_TOKEN` to the same value to skip the login screen in dev.

## Live OpenClaw integration

```bash
export OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
export OPENCLAW_GATEWAY_TOKEN=your-gateway-token
export DASHCLAW_TOKEN=your-dashboard-token

pnpm --filter @dashclaw/server dev
pnpm --filter @dashclaw/web dev
```

Ensure the Gateway is running (`openclaw gateway status`).

## Architecture

- `apps/server` — Gateway bridge, SQLite runtime store, SSE API, admin RPC proxy
- `apps/web` — Agent OS UI (Command Center, Timeline, Agents, Sessions, Tasks, Cron, Approvals, Admin)
- `packages/openclaw-gateway` — Gateway WebSocket client + fake gateway for tests
- `packages/runtime-model` — shared types, RPC allowlists, redaction helpers

See [docs/openclaw-integration.md](docs/openclaw-integration.md) and [docs/admin-safety.md](docs/admin-safety.md).

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run server + web in parallel |
| `pnpm build` | Build all packages |
| `pnpm test` | Run unit/integration tests |
| `pnpm typecheck` | Typecheck all packages |

## Environment

Configuration lives in the **repo root** `.env` file (copy from `.env.example`). Optional `.env.local` overrides `.env` and is gitignored.

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHCLAW_PORT` | `8090` | Server HTTP port |
| `DASHCLAW_BIND` | `127.0.0.1` | Server bind address |
| `DASHCLAW_TOKEN` | random UUID | Dashboard auth token |
| `DASHCLAW_DB` | `./data/dashclaw.db` | SQLite database path |
| `OPENCLAW_GATEWAY_URL` | `ws://127.0.0.1:18789` | Gateway WebSocket URL |
| `OPENCLAW_GATEWAY_TOKEN` | — | Gateway auth token |
| `DASHCLAW_FAKE_GATEWAY` | — | Set `1` to use in-process fake gateway |
| `VITE_PORT` | `5173` | Web dev server port |
| `VITE_DASHCLAW_API_URL` | `http://127.0.0.1:$DASHCLAW_PORT` | API proxy target for web dev |
| `VITE_DASHCLAW_TOKEN` | — | Auto-fill dashboard token in browser (dev) |

## License

MIT
