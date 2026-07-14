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

Open http://localhost:5173 in **dev** (Vite + hot reload). If `DASHCLAW_TOKEN` is set in `.env`, set `VITE_DASHCLAW_TOKEN` to the same value to skip the login screen.

### Production (single port)

After building, the server serves the UI from the same port as the API:

```bash
pnpm start
# open http://127.0.0.1:8090
```

Set `DASHCLAW_SERVE_WEB=0` to run API-only. Override UI path with `DASHCLAW_WEB_DIST`.

## Live OpenClaw integration

```bash
export OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
export OPENCLAW_GATEWAY_TOKEN=your-gateway-token
export DASHCLAW_TOKEN=your-dashboard-token

pnpm --filter @dashclaw/server dev
pnpm --filter @dashclaw/web dev
```

Ensure the Gateway is running (`openclaw gateway status`).

### Remote gateway (SSH port forward)

If your OpenClaw Gateway runs on another machine, the easiest way to connect is to forward its port over SSH. Dashclaw defaults to `ws://127.0.0.1:18789`, so once the tunnel is up you can leave `OPENCLAW_GATEWAY_URL` unchanged.

Add a host entry to `~/.ssh/config`:

```
Host openclaw
  HostName <host>
  User <user>
  IdentityFile <path-to-key>
  IdentitiesOnly yes
  LocalForward 18789 127.0.0.1:18789
```

Open the tunnel:

```bash
ssh openclaw
```

With the SSH session running, start Dashclaw locally as usual. Traffic to `127.0.0.1:18789` is forwarded to the remote gateway. Set `OPENCLAW_GATEWAY_TOKEN` to the token from the remote host.

## Architecture

- `apps/server` — Gateway bridge, SQLite runtime store, SSE API, admin RPC proxy
- `apps/web` — Agent OS UI built with **Clawdeck** (custom design system), TanStack Query, React Router
- `packages/openclaw-gateway` — Gateway WebSocket client + fake gateway for tests
- `packages/runtime-model` — shared types, RPC allowlists, redaction helpers

## OpenClaw integration

Dashclaw talks to OpenClaw over the **Gateway WebSocket protocol** (not by reading `~/.openclaw` files).

1. Server opens `OPENCLAW_GATEWAY_URL` (default `ws://127.0.0.1:18789`).
2. Gateway sends `connect.challenge`; server responds with operator auth.
3. Gateway returns `hello-ok`; server polls RPCs and subscribes to pushed events.

**Read RPCs (v0):** `health`, `agents.list`, `sessions.list`, `sessions.preview`, `tasks.list`, `cron.list`, `cron.runs`, `node.list`, `exec.approval.list`, `logs.tail`

**Write RPCs (Admin Console):** `sessions.abort`, `cron.run`, `exec.approval.resolve`, `tools.invoke`, `config.set`, `gateway.restart.request`, and others in the allowlist.

**Events:** `agent`, `session.message`, `session.operation`, `session.tool`, `sessions.changed`, `cron`, `health`, `presence`, `heartbeat`, `exec.approval.requested`, `exec.approval.resolved`, `shutdown`

Gateway events are not replayed; on sequence gaps Dashclaw refreshes snapshot via RPC. Pin against your installed OpenClaw version and recheck the [Gateway protocol docs](https://docs.openclaw.ai/gateway/protocol) when upgrading.

Set `DASHCLAW_FAKE_GATEWAY=1` to use an in-process mock Gateway without a live OpenClaw install. Add `DASHCLAW_FAKE_GATEWAY_SCENARIO=idle|busy|failed|approval-heavy|approval-cockpit|degraded|discord-workflow|session-pagination|task-contract` to drive repeatable dashboard states, including multi-page discovery and live-shaped task telemetry.

## Admin safety

Admin-capable Gateway RPCs go through a guarded proxy:

1. **Dashboard auth** — Bearer token (`DASHCLAW_TOKEN`) on all routes except `/api/health`.
2. **RPC allowlist** — Only `READ_RPC_METHODS` / `WRITE_RPC_METHODS` are permitted.
3. **High-risk confirmation** — `config.set`, `update.run`, `gateway.restart.request`, `tools.invoke`, etc. require a confirm token from `POST /api/admin/confirm`.
4. **Audit log** — Mutating RPCs are persisted with actor, method, redacted params, and result summary.
5. **Redaction** — Tokens, passwords, secrets, and large payloads are redacted before storage or UI display.

Defaults: bind `127.0.0.1` only; gateway token stays server-side. Do not expose Dashclaw on public networks without TLS and stronger auth.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run server + web in parallel (two ports) |
| `pnpm start` | Build all packages and run server with bundled UI |
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
| `DASHCLAW_FAKE_GATEWAY_SCENARIO` | `busy` | Fake gateway scenario, including `session-pagination` and `task-contract` contract fixtures |
| `DASHCLAW_SERVE_WEB` | auto | Set `0` to disable bundled UI in production |
| `DASHCLAW_WEB_DIST` | `apps/web/dist` | Path to built web assets |
| `VITE_PORT` | `5173` | Web dev server port |
| `VITE_DASHCLAW_API_URL` | `http://127.0.0.1:$DASHCLAW_PORT` | API proxy target for web dev |
| `VITE_DASHCLAW_TOKEN` | — | Auto-fill dashboard token in browser (dev) |

## License

[MIT](LICENSE)
