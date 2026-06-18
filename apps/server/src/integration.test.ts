import { describe, expect, it, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { startFakeGateway, type FakeGatewayHandle } from "@dashclaw/openclaw-gateway";
import { RuntimeStore } from "./runtime-store.js";
import { GatewayBridge } from "./gateway-bridge.js";
import { AdminService } from "./admin-service.js";

describe("server integration", () => {
  let fake: FakeGatewayHandle | null = null;
  let store: RuntimeStore | null = null;
  let bridge: GatewayBridge | null = null;

  afterEach(async () => {
    if (bridge) await bridge.stop();
    bridge = null;
    if (fake) await fake.close();
    fake = null;
    store?.close();
    store = null;
  });

  it("builds snapshot from fake gateway", async () => {
    fake = await startFakeGateway({ token: "test-token" });
    store = new RuntimeStore(join(tmpdir(), `dashclaw-${randomUUID()}.db`));

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

  it("audits admin RPC calls", async () => {
    fake = await startFakeGateway({ token: "test-token" });
    store = new RuntimeStore(join(tmpdir(), `dashclaw-${randomUUID()}.db`));

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

    const result = await admin.executeRpc({ method: "health", actor: "test" });
    expect(result.ok).toBe(true);

    const audit = store.listAudit(10);
    expect(audit.some((e) => e.method === "health" && e.success)).toBe(true);
  });
});
