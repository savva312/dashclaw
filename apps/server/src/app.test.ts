import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RUNTIME_LIMITS, type RuntimeSnapshot } from "@dashclaw/runtime-model";
import { AdminService } from "./admin-service.js";
import { createApp, parseQueryLimit } from "./app.js";
import type { GatewayBridge } from "./gateway-bridge.js";
import { RuntimeStore } from "./runtime-store.js";

const SENTINEL = "SEC005_API_SSE_SENTINEL";
const AUTH = { Authorization: "Bearer dash-token" };

function unsafeSnapshot(): RuntimeSnapshot {
  return {
    gatewayId: "default",
    connectionState: "connected",
    health: {
      ok: false,
      raw: {
        "api-key": SENTINEL,
        diagnostic: "diagnostic context",
      },
    },
    agents: [],
    sessions: [],
    tasks: [{
      id: "task-1",
      status: "failed",
      error: `Authorization: Bearer ${SENTINEL}`,
    }],
    cronJobs: [],
    approvals: [{
      id: "approval-1",
      kind: "exec",
      status: "pending",
      command: `deploy password=${SENTINEL} --target staging`,
    }],
    nodes: [],
    activeRunCount: 0,
    pendingApprovalCount: 1,
    failedTaskCount: 1,
    updatedAt: "2026-07-21T06:00:00.000Z",
  };
}

function createUnsafeBridge(): GatewayBridge {
  const snapshot = unsafeSnapshot();
  return {
    getSnapshot: () => snapshot,
    refreshSnapshot: async () => snapshot,
    setEventHandlers: (handlers: unknown) => {
      void handlers;
    },
    rpc: async (method: string, params?: unknown) => {
      if (method === "status") {
        throw new Error(`Gateway rejected Authorization: Bearer ${SENTINEL}`);
      }
      if (method === "sessions.preview") {
        const keys = (params as { keys?: unknown[] } | undefined)?.keys;
        if (keys?.[0] === "error") {
          throw new Error(`preview api_key=${SENTINEL}`);
        }
        return {
          previews: [{
            key: "session-1",
            status: "ready",
            token: SENTINEL,
            items: [{
              id: "message-1",
              role: "assistant",
              text: `preview context password=${SENTINEL}`,
              raw: SENTINEL,
            }],
          }],
        };
      }
      if (method === "cron.runs") {
        return {
          runs: [{
            id: "run-1",
            summary: "run context",
            credentials: SENTINEL,
          }],
        };
      }
      return {
        lines: [`log context Cookie: session=${SENTINEL}`],
        private_key: SENTINEL,
      };
    },
  } as unknown as GatewayBridge;
}

describe("safe API and SSE output boundary", () => {
  let store: RuntimeStore | undefined;

  afterEach(() => {
    store?.close();
    store = undefined;
  });

  it("removes sentinels from snapshots, persisted data, previews, cron, and admin results", async () => {
    store = new RuntimeStore(":memory:");
    store.appendTimeline({
      kind: "session.message",
      timestamp: "2026-07-21T06:00:00.000Z",
      title: "Useful event",
      summary: `session_token=${SENTINEL}`,
    });
    store.appendAudit({
      timestamp: "2026-07-21T06:00:00.000Z",
      actor: "operator",
      method: "health",
      paramsSummary: `password=${SENTINEL}`,
      success: false,
      error: `Bearer ${SENTINEL}`,
    });
    const bridge = createUnsafeBridge();
    const admin = new AdminService({ store, bridge, dashboardToken: "dash-token" });
    const app = createApp({ store, bridge, admin });

    const requests = [
      app.request("/api/snapshot", { headers: AUTH }),
      app.request("/api/timeline", { headers: AUTH }),
      app.request("/api/audit", { headers: AUTH }),
      app.request("/api/sessions/session-1/preview", { headers: AUTH }),
      app.request("/api/cron/runs?jobId=job-1", { headers: AUTH }),
      app.request("/api/admin/rpc", {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "logs.tail",
          params: { AWS_ACCESS_KEY_ID: SENTINEL, lines: 10 },
        }),
      }),
    ];
    const bodies = await Promise.all((await Promise.all(requests)).map((response) => response.text()));
    const combined = bodies.join("\n");

    expect(combined).not.toContain(SENTINEL);
    expect(combined).toContain("diagnostic context");
    expect(combined).toContain("preview context");
    expect(combined).toContain("run context");
    expect(combined).toContain("log context");
    expect(combined).toContain("--target staging");
  });

  it("returns stable public error codes without leaking Gateway diagnostics", async () => {
    store = new RuntimeStore(":memory:");
    const bridge = createUnsafeBridge();
    const admin = new AdminService({ store, bridge, dashboardToken: "dash-token" });
    const app = createApp({ store, bridge, admin });

    const adminResponse = await app.request("/api/admin/rpc", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ method: "status" }),
    });
    const previewResponse = await app.request("/api/sessions/error/preview", { headers: AUTH });
    const combined = `${await adminResponse.text()}\n${await previewResponse.text()}`;

    expect(combined).not.toContain(SENTINEL);
    expect(combined).toContain("GATEWAY_RPC_FAILED");
    expect(combined).toContain("GATEWAY_PREVIEW_FAILED");
  });

  it("removes sentinels from initial SSE snapshot and timeline events", async () => {
    store = new RuntimeStore(":memory:");
    store.appendTimeline({
      kind: "approval.requested",
      timestamp: "2026-07-21T06:00:00.000Z",
      title: "Approval requested",
      summary: `command api_key=${SENTINEL} --target staging`,
    });
    const bridge = createUnsafeBridge();
    const admin = new AdminService({ store, bridge, dashboardToken: "dash-token" });
    const app = createApp({ store, bridge, admin });

    const response = await app.request("/api/events", { headers: AUTH });
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const decoder = new TextDecoder();
    let output = "";
    for (let index = 0; index < 4 && !output.includes("event: timeline"); index += 1) {
      const chunk = await reader!.read();
      if (chunk.done) break;
      output += decoder.decode(chunk.value, { stream: true });
    }
    await reader!.cancel();

    expect(output).toContain("event: snapshot");
    expect(output).toContain("event: timeline");
    expect(output).toContain("diagnostic context");
    expect(output).toContain("--target staging");
    expect(output).not.toContain(SENTINEL);
  });

  it.each([
    { name: "a reusable query token", headers: undefined },
    {
      name: "an invalid bearer header even with a valid query token",
      headers: { Authorization: "Bearer wrong-token" },
    },
  ])("rejects $name before sending SSE data", async ({ headers }) => {
    store = new RuntimeStore(":memory:");
    const bridge = createUnsafeBridge();
    const admin = new AdminService({ store, bridge, dashboardToken: "dash-token" });
    const app = createApp({ store, bridge, admin });

    const response = await app.request("/api/events?token=dash-token", { headers });
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(JSON.parse(body)).toEqual({
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    });
    expect(body).not.toContain(SENTINEL);
    expect(body).not.toContain("diagnostic context");
  });
});

describe("production browser security headers", () => {
  it("applies restrictive headers to production UI and API responses", async () => {
    const webDist = mkdtempSync(join(tmpdir(), "dashclaw-web-"));
    writeFileSync(join(webDist, "index.html"), "<!doctype html><div id=\"root\"></div>");
    const store = new RuntimeStore(":memory:");
    const bridge = createUnsafeBridge();
    const admin = new AdminService({ store, bridge, dashboardToken: "dash-token" });

    try {
      const app = createApp({ store, bridge, admin }, { webDist });
      for (const path of ["/", "/api/health"]) {
        const response = await app.request(path);
        const csp = response.headers.get("Content-Security-Policy");

        expect(response.status).toBe(200);
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("script-src 'self'");
        expect(csp).toContain("connect-src 'self'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).not.toContain("'unsafe-eval'");
        expect(csp).not.toContain("fonts.googleapis.com");
        expect(csp).not.toContain("fonts.gstatic.com");
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
        expect(response.headers.get("Permissions-Policy")).toBe(
          "camera=(), geolocation=(), microphone=()",
        );
      }
    } finally {
      store.close();
      rmSync(webDist, { force: true, recursive: true });
    }
  });

  it("does not impose the production UI CSP in API-only mode", async () => {
    const store = new RuntimeStore(":memory:");
    const bridge = createUnsafeBridge();
    const admin = new AdminService({ store, bridge, dashboardToken: "dash-token" });
    try {
      const response = await createApp({ store, bridge, admin }).request("/api/health");
      expect(response.headers.get("Content-Security-Policy")).toBeNull();
    } finally {
      store.close();
    }
  });
});

describe("route parameter handling", () => {
  it("passes a literal percent session key through exactly once", async () => {
    const store = new RuntimeStore(":memory:");
    let previewKey: string | undefined;
    const bridge = createUnsafeBridge();
    bridge.rpc = async <T>(_method: string, params?: unknown): Promise<T> => {
      previewKey = (params as { keys: string[] }).keys[0];
      return {} as T;
    };
    const admin = new AdminService({ store, bridge, dashboardToken: "dash-token" });

    try {
      const response = await createApp({ store, bridge, admin }).request(
        "/api/sessions/literal%25/preview",
        { headers: AUTH },
      );
      expect(response.status).toBe(200);
      expect(previewKey).toBe("literal%");
    } finally {
      store.close();
    }
  });
});

describe("server runtime limits", () => {
  let store: RuntimeStore | undefined;

  afterEach(() => {
    store?.close();
    store = undefined;
  });

  function buildApp(options: { maxSseClients?: number; sseMaxConnectionMs?: number } = {}) {
    store = new RuntimeStore(":memory:");
    const bridge = createUnsafeBridge();
    const admin = new AdminService({ store, bridge, dashboardToken: "dash-token" });
    return createApp({ store, bridge, admin }, options);
  }

  it("rejects malformed limits and clamps excessive limits", async () => {
    const app = buildApp();
    for (const limit of ["-1", "1.5", "Infinity", "NaN", "0"]) {
      const response = await app.request(
        `/api/timeline?limit=${encodeURIComponent(limit)}`,
        { headers: AUTH },
      );
      expect(response.status).toBe(400);
    }
    expect(parseQueryLimit("999999", 200, 500)).toEqual({ ok: true, value: 500 });

    for (let index = 0; index < RUNTIME_LIMITS.http.timelineMax + 5; index += 1) {
      store!.appendTimeline({
        kind: "health",
        timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        title: `Event ${index}`,
      });
    }
    const response = await app.request("/api/timeline?limit=999999", { headers: AUTH });
    const body = await response.json() as { events: unknown[] };
    expect(response.status).toBe(200);
    expect(body.events).toHaveLength(RUNTIME_LIMITS.http.timelineMax);
  });

  it("returns 413 without parsing oversized JSON bodies", async () => {
    const app = buildApp();
    const response = await app.request("/api/admin/confirm", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ method: "x".repeat(RUNTIME_LIMITS.http.maxJsonBodyBytes) }),
    });
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Request body too large" });
  });

  it("keeps public health readiness-safe and protects detailed storage health", async () => {
    const app = buildApp();
    const publicResponse = await app.request("/api/health");
    expect(await publicResponse.json()).toEqual({
      ok: true,
      degraded: false,
    });

    const unauthorizedResponse = await app.request("/api/health/storage");
    expect(unauthorizedResponse.status).toBe(401);

    const response = await app.request("/api/health/storage", { headers: AUTH });
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      storage: { timelineRows: 0, auditRows: 0, overHighWater: false },
    });
    expect(JSON.stringify(body)).not.toContain("path");
  });

  it("caps active SSE clients and releases maximum-age streams", async () => {
    const app = buildApp({ maxSseClients: 1, sseMaxConnectionMs: 25 });
    const first = await app.request("/api/events", { headers: AUTH });
    expect(first.status).toBe(200);

    const rejected = await app.request("/api/events", { headers: AUTH });
    expect(rejected.status).toBe(503);

    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterCleanup = await app.request("/api/events", { headers: AUTH });
    expect(afterCleanup.status).toBe(200);
    await first.body?.cancel();
    await afterCleanup.body?.cancel();
  });
});
