import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startFakeGateway, type FakeGatewayHandle } from "@dashclaw/openclaw-gateway";
import type { AdminRpcRequest } from "@dashclaw/runtime-model";
import { RuntimeStore } from "./runtime-store.js";
import { GatewayBridge } from "./gateway-bridge.js";
import { AdminService } from "./admin-service.js";

describe("server integration", () => {
  let fake: FakeGatewayHandle | null = null;
  let store: RuntimeStore | null = null;
  let bridge: GatewayBridge | null = null;
  let dataDirectory: string | null = null;

  afterEach(async () => {
    if (bridge) await bridge.stop();
    bridge = null;
    if (fake) await fake.close();
    fake = null;
    store?.close();
    store = null;
    if (dataDirectory) rmSync(dataDirectory, { recursive: true, force: true });
    dataDirectory = null;
  });

  it("builds snapshot from fake gateway", async () => {
    fake = await startFakeGateway({ token: "test-token" });
    store = new RuntimeStore(createTestDbPath());

    bridge = new GatewayBridge({
      url: fake.url,
      token: "test-token",
      store,
    });

    await bridge.start();
    const snapshot = await bridge.refreshSnapshot();

    expect(snapshot.connectionState).toBe("connected");
    expect(snapshot.agents.length).toBeGreaterThan(0);
    expect(snapshot.tasks.some((t) => t.status === "running")).toBe(true);
  });

  it("preserves fake gateway degraded state in snapshots", async () => {
    fake = await startFakeGateway({ token: "test-token", scenario: "degraded" });
    store = new RuntimeStore(createTestDbPath());

    bridge = new GatewayBridge({
      url: fake.url,
      token: "test-token",
      store,
    });

    await bridge.start();
    const degraded = await bridge.refreshSnapshot();

    expect(degraded.health?.degraded).toBe(true);
    expect(degraded.failedTaskCount).toBeGreaterThan(0);
    expect(degraded.tasks.some((task) => task.id === "task-delivery-lost")).toBe(true);
  });

  it("uses minimal Gateway scopes and blocks writes in read-only mode", async () => {
    fake = await startFakeGateway({ token: "test-token" });
    store = new RuntimeStore(createTestDbPath());

    bridge = new GatewayBridge({
      url: fake.url,
      token: "test-token",
      readOnly: true,
      store,
    });

    await bridge.start();

    expect(fake.getRequestedScopes()).toEqual(["operator.read"]);
    await expect(bridge.rpc("sessions.abort", { key: "agent:main:main" })).rejects.toThrow(
      "Gateway writes are disabled in read-only mode",
    );
  });

  it("builds snapshot from Discord workflow fake gateway scenario", async () => {
    fake = await startFakeGateway({ token: "test-token", scenario: "discord-workflow" });
    store = new RuntimeStore(createTestDbPath());

    bridge = new GatewayBridge({
      url: fake.url,
      token: "test-token",
      store,
    });

    await bridge.start();
    const snapshot = await bridge.refreshSnapshot();

    expect(snapshot.sessions).toHaveLength(7);
    expect(snapshot.tasks).toHaveLength(7);
    expect(snapshot.tasks.filter((task) => task.status === "running" || task.status === "queued")).toHaveLength(4);
    expect(snapshot.tasks.filter((task) => task.status === "completed")).toHaveLength(1);
    expect(snapshot.failedTaskCount).toBe(2);
    expect(snapshot.pendingApprovalCount).toBe(1);
    expect(snapshot.sessions.find((session) => session.key === "agent:dashclaw:discord:thread:work-board:subagent:model")).toMatchObject({
      agentId: "fixture-model",
      parentSessionKey: "agent:dashclaw:discord:thread:work-board",
      worktree: {
        id: "task-039-fixture-model-lane",
        branch: "agent/task-039-fixture-model-lane",
        path: "/workspace/.worktrees/task-039-fixture-model-lane",
        repoRoot: "/workspace/dashclaw",
      },
    });
    expect(snapshot.sessions.find((session) => session.key === "agent:dashclaw:discord:thread:work-board")?.worktree).toBeUndefined();
    expect(snapshot.tasks.find((task) => task.id === "task-lost-background-result")).toMatchObject({
      status: "timed_out",
      sessionKey: "agent:fixture-model:subagent:missing-delivery",
    });
  });

  it("publishes every session from a fake gateway with more than 100 sessions", async () => {
    fake = await startFakeGateway({ token: "test-token", scenario: "session-pagination" });
    store = new RuntimeStore(createTestDbPath());

    bridge = new GatewayBridge({
      url: fake.url,
      token: "test-token",
      store,
    });
    await bridge.start();
    const snapshot = await bridge.refreshSnapshot();

    expect(snapshot.sessions).toHaveLength(125);
    expect(new Set(snapshot.sessions.map((session) => session.key))).toHaveLength(125);
    expect(snapshot.discovery?.sessions).toMatchObject({
      state: "complete",
      degraded: false,
      pagesFetched: 2,
      rowsFetched: 125,
      uniqueSessionsFetched: 125,
      publishedSessions: 125,
      expectedTotal: 125,
    });
  });

  it("preserves task contract progress, results, runtime, lineage, and unavailable summaries", async () => {
    fake = await startFakeGateway({ token: "test-token", scenario: "task-contract" });
    store = new RuntimeStore(createTestDbPath());
    bridge = new GatewayBridge({ url: fake.url, token: "test-token", store });

    await bridge.start();
    const snapshot = await bridge.refreshSnapshot();

    expect(snapshot.tasks).toHaveLength(82);
    expect(snapshot.tasks.find((task) => task.id === "task-contract-running")).toMatchObject({
      progressSummary: "Inspecting task lifecycle and result fields",
      ownerKey: "agent:main:main",
      childSessionKey: "agent:worker:subagent",
      sourceId: "dashboard",
      flowId: "flow-contract",
      runtime: { id: "runtime-contract-running", source: "gateway", runtimeMs: 340000 },
    });
    expect(snapshot.tasks.find((task) => task.id === "task-contract-success")).toMatchObject({
      terminalSummary: "Validated all supported task fields",
      startedAt: "2026-06-24T17:48:00.000Z",
      endedAt: "2026-06-24T17:51:00.000Z",
    });
    expect(snapshot.tasks.find((task) => task.id === "task-contract-failed")).toMatchObject({
      error: "Task schema mismatch",
      errorCode: "TASK_SCHEMA_MISMATCH",
      errorKind: "validation",
    });
    expect(snapshot.tasks.find((task) => task.id === "task-contract-missing-summary")?.terminalSummary).toBeUndefined();
  });

  it("audits admin RPC calls", async () => {
    fake = await startFakeGateway({ token: "test-token" });
    store = new RuntimeStore(createTestDbPath());

    bridge = new GatewayBridge({
      url: fake.url,
      token: "test-token",
      store,
    });
    await bridge.start();

    const admin = new AdminService({
      store,
      bridge,
      dashboardToken: "dash-token",
    });

    expect(admin.validateAuth("Bearer dash-token")).toBe(true);
    expect(admin.validateAuth("Bearer wrong")).toBe(false);

    const auth = admin.authenticate("Bearer dash-token");
    expect(auth?.principal.id).toMatch(/^dashboard-session:/);
    expect(auth?.sessionToken).toBeTruthy();
    const resumed = admin.authenticate("Bearer dash-token", auth?.sessionToken);
    expect(resumed?.principal).toEqual(auth?.principal);

    const forgedRequest = {
      method: "health",
      actor: "forged-human-identity",
    } as unknown as AdminRpcRequest;
    const result = await admin.executeRpc(auth!.principal, forgedRequest);
    expect(result.ok).toBe(true);

    const audit = store.listAudit(10);
    expect(audit).toContainEqual(expect.objectContaining({
      method: "health",
      success: true,
      actor: auth?.principal.id,
    }));
    expect(audit.some((entry) => entry.actor === "forged-human-identity")).toBe(false);
  });

  function createTestDbPath(): string {
    dataDirectory = mkdtempSync(join(tmpdir(), "dashclaw-integration-"));
    return join(dataDirectory, "runtime.db");
  }
});
