import { loadEnv } from "./load-env.js";

loadEnv();

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import type { FakeGatewayScenario } from "@dashclaw/openclaw-gateway";
import { AdminService } from "./admin-service.js";
import { GatewayBridge } from "./gateway-bridge.js";
import { RuntimeStore } from "./runtime-store.js";

const PORT = Number(process.env.DASHCLAW_PORT ?? "8090");
const BIND = process.env.DASHCLAW_BIND ?? "127.0.0.1";
const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL ?? "ws://127.0.0.1:18789";
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? process.env.OPENCLAW_GATEWAY_PASSWORD;
const DASHBOARD_TOKEN = process.env.DASHCLAW_TOKEN ?? randomUUID();
const DASHBOARD_TOKEN_FROM_ENV = Boolean(process.env.DASHCLAW_TOKEN);
const DB_PATH = process.env.DASHCLAW_DB ?? join(process.cwd(), "data", "dashclaw.db");
const USE_FAKE = process.env.DASHCLAW_FAKE_GATEWAY === "1";
const FAKE_GATEWAY_SCENARIO = parseFakeGatewayScenario(process.env.DASHCLAW_FAKE_GATEWAY_SCENARIO);
const WEB_DIST = process.env.DASHCLAW_WEB_DIST ?? join(process.cwd(), "apps/web/dist");
const SERVE_WEB = process.env.DASHCLAW_SERVE_WEB !== "0" && existsSync(join(WEB_DIST, "index.html"));

async function main(): Promise<void> {
  mkdirSync(dirname(DB_PATH), { recursive: true });

  const store = new RuntimeStore(DB_PATH);
  let gatewayUrl = GATEWAY_URL;
  let gatewayToken = GATEWAY_TOKEN;

  if (USE_FAKE) {
    const { startFakeGateway } = await import("@dashclaw/openclaw-gateway");
    gatewayToken = gatewayToken ?? "test-token";
    const fake = await startFakeGateway({
      token: gatewayToken,
      scenario: FAKE_GATEWAY_SCENARIO,
      assistantSequenceSessionKey: process.env.DASHCLAW_FAKE_GATEWAY_ASSISTANT_SESSION,
    });
    gatewayUrl = fake.url;
    console.log(`[dashclaw] fake gateway at ${gatewayUrl} (${fake.scenario})`);
  }

  const bridge = new GatewayBridge({
    url: gatewayUrl,
    token: gatewayToken,
    store,
  });

  const admin = new AdminService({
    store,
    bridge,
    dashboardToken: DASHBOARD_TOKEN,
  });

  const app = createApp({ store, bridge, admin }, { webDist: SERVE_WEB ? WEB_DIST : undefined });

  serve({ fetch: app.fetch, port: PORT, hostname: BIND }, (info) => {
    console.log(`[dashclaw] server http://${info.address}:${info.port}`);
    const tokenLog = DASHBOARD_TOKEN_FROM_ENV
      ? `${DASHBOARD_TOKEN.slice(0, 8)}...`
      : DASHBOARD_TOKEN;
    console.log(`[dashclaw] dashboard token: ${tokenLog}`);
    console.log(`[dashclaw] gateway url: ${gatewayUrl}`);
    if (SERVE_WEB) console.log(`[dashclaw] UI bundled at ${WEB_DIST}`);
  });

  try {
    await bridge.start();
    console.log("[dashclaw] connected to OpenClaw gateway");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[dashclaw] gateway not available:", msg);
    console.warn("[dashclaw] UI will show disconnected until gateway is reachable");
    console.warn("[dashclaw] client will retry in background if the WebSocket stays open");
  }

  const shutdown = async () => {
    await bridge.stop();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

function parseFakeGatewayScenario(value: string | undefined): FakeGatewayScenario | undefined {
  if (
    value === "idle" ||
    value === "busy" ||
    value === "failed" ||
    value === "approval-heavy" ||
    value === "approval-cockpit" ||
    value === "degraded" ||
    value === "discord-workflow" ||
    value === "session-pagination" ||
    value === "task-contract"
  ) {
    return value;
  }
  if (value) console.warn(`[dashclaw] ignoring unknown fake gateway scenario: ${value}`);
  return undefined;
}

void main();
