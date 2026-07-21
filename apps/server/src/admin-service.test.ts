import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminService, type AuthenticatedPrincipal } from "./admin-service.js";
import { createApp } from "./app.js";
import type { GatewayBridge } from "./gateway-bridge.js";
import { RuntimeStore } from "./runtime-store.js";

const principalA: AuthenticatedPrincipal = {
  id: "dashboard-session:principal-a",
  kind: "dashboard-session",
};
const principalB: AuthenticatedPrincipal = {
  id: "dashboard-session:principal-b",
  kind: "dashboard-session",
};
const invalidConfirmation = {
  ok: false,
  error: "Invalid or expired confirmToken",
  code: "RPC_CONFIRMATION_INVALID",
};

describe("AdminService security", () => {
  const stores: RuntimeStore[] = [];
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const store of stores.splice(0)) store.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function setup(options: {
    readOnly?: boolean;
    now?: () => number;
    confirmationTtlMs?: number;
    maxConfirmationRecords?: number;
  } = {}) {
    const root = mkdtempSync(join(tmpdir(), "dashclaw-admin-"));
    tempRoots.push(root);
    const store = new RuntimeStore(join(root, "data", "runtime.db"));
    stores.push(store);
    const bridge = {
      rpc: vi.fn(async () => ({ accepted: true })),
      refreshSnapshot: vi.fn(async () => emptySnapshot()),
      getSnapshot: vi.fn(() => emptySnapshot()),
      setEventHandlers: vi.fn(),
    } as unknown as GatewayBridge;
    const admin = new AdminService({
      store,
      bridge,
      dashboardToken: "dash-token",
      ...options,
    });
    return { admin, bridge, store };
  }

  it("validates bearer credentials through fixed-length digests", () => {
    const { admin } = setup();

    expect(admin.validateAuth("Bearer dash-token")).toBe(true);
    expect(admin.validateAuth("Bearer short")).toBe(false);
    expect(admin.validateAuth(`Bearer ${"x".repeat(200)}`)).toBe(false);
    expect(admin.validateAuth(undefined)).toBe(false);
  });

  it("rejects an empty dashboard credential", () => {
    const { bridge, store } = setup();
    expect(() => new AdminService({ store, bridge, dashboardToken: " " })).toThrow(
      "dashboardToken must not be empty",
    );
  });

  it("binds confirmation to principal, method, parameters, and one use", async () => {
    const { admin, bridge } = setup();
    const params = { tool: "shell", input: { command: "date", timeout: 10 } };

    const wrongPrincipal = admin.requestConfirmation(principalA, "tools.invoke", params);
    expect(await admin.executeRpc(principalB, {
      method: "tools.invoke",
      params,
      confirmToken: wrongPrincipal.confirmToken,
    })).toEqual(invalidConfirmation);
    expect(await admin.executeRpc(principalA, {
      method: "tools.invoke",
      params,
      confirmToken: wrongPrincipal.confirmToken,
    })).toEqual(invalidConfirmation);

    const wrongMethod = admin.requestConfirmation(principalA, "tools.invoke", params);
    expect(await admin.executeRpc(principalA, {
      method: "config.set",
      params,
      confirmToken: wrongMethod.confirmToken,
    })).toEqual(invalidConfirmation);

    const wrongParams = admin.requestConfirmation(principalA, "tools.invoke", params);
    expect(await admin.executeRpc(principalA, {
      method: "tools.invoke",
      params: { ...params, input: { command: "whoami", timeout: 10 } },
      confirmToken: wrongParams.confirmToken,
    })).toEqual(invalidConfirmation);

    const valid = admin.requestConfirmation(principalA, "tools.invoke", params);
    const reorderedParams = { input: { timeout: 10, command: "date" }, tool: "shell" };
    expect(await admin.executeRpc(principalA, {
      method: "tools.invoke",
      params: reorderedParams,
      confirmToken: valid.confirmToken,
    })).toEqual({ ok: true, result: { accepted: true } });
    expect(await admin.executeRpc(principalA, {
      method: "tools.invoke",
      params,
      confirmToken: valid.confirmToken,
    })).toEqual(invalidConfirmation);

    expect(bridge.rpc).toHaveBeenCalledTimes(1);
  });

  it("requires confirmations for session aborts and task cancellations", async () => {
    const { admin, bridge } = setup();

    for (const method of ["sessions.abort", "tasks.cancel"]) {
      const params = { id: `${method}-target` };
      expect(await admin.executeRpc(principalA, { method, params })).toEqual({
        ok: false,
        error: "High-risk RPC requires confirmToken from /api/admin/confirm",
        code: "RPC_CONFIRMATION_REQUIRED",
      });

      const confirmation = admin.requestConfirmation(principalA, method, params);
      expect(await admin.executeRpc(principalA, {
        method,
        params,
        confirmToken: confirmation.confirmToken,
      })).toEqual({ ok: true, result: { accepted: true } });
    }

    expect(bridge.rpc).toHaveBeenCalledTimes(2);
  });

  it("expires, prunes, and bounds pending confirmations", async () => {
    let now = 1_000;
    const { admin, bridge } = setup({
      now: () => now,
      confirmationTtlMs: 100,
      maxConfirmationRecords: 2,
    });
    const params = { tool: "shell" };
    const first = admin.requestConfirmation(principalA, "tools.invoke", params);
    admin.requestConfirmation(principalA, "tools.invoke", params);
    const newest = admin.requestConfirmation(principalA, "tools.invoke", params);

    expect(await admin.executeRpc(principalA, {
      method: "tools.invoke",
      params,
      confirmToken: first.confirmToken,
    })).toEqual(invalidConfirmation);

    now = 1_101;
    expect(await admin.executeRpc(principalA, {
      method: "tools.invoke",
      params,
      confirmToken: newest.confirmToken,
    })).toEqual(invalidConfirmation);
    expect(bridge.rpc).not.toHaveBeenCalled();
  });

  it("omits write routes and rejects writes in read-only mode", async () => {
    const { admin, bridge, store } = setup({ readOnly: true });
    const app = createApp(
      { admin, bridge, store },
      { readOnly: true },
    );

    const methodsResponse = await app.request("/api/admin/methods", {
      headers: { Authorization: "Bearer dash-token" },
    });
    expect(methodsResponse.status).toBe(200);
    expect(await methodsResponse.json()).toMatchObject({ write: [], highRisk: [] });

    for (const path of ["/api/admin/confirm", "/api/admin/rpc"]) {
      const response = await app.request(path, {
        method: "POST",
        headers: {
          Authorization: "Bearer dash-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ method: "tools.invoke", params: {} }),
      });
      expect(response.status).toBe(404);
    }

    expect(await admin.executeRpc(principalA, {
      method: "sessions.abort",
      params: { key: "agent:main:main" },
    })).toEqual({
      ok: false,
      error: "Admin writes are disabled in read-only mode",
      code: "RPC_WRITES_DISABLED",
    });
    expect(bridge.rpc).not.toHaveBeenCalled();
  });
});

function emptySnapshot() {
  return {
    gatewayId: "test",
    connectionState: "connected" as const,
    health: { ok: true },
    agents: [],
    sessions: [],
    tasks: [],
    cronJobs: [],
    approvals: [],
    nodes: [],
    activeRunCount: 0,
    pendingApprovalCount: 0,
    failedTaskCount: 0,
    updatedAt: new Date(0).toISOString(),
  };
}
