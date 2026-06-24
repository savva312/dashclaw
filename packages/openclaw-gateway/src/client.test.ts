import { describe, expect, it, afterEach } from "vitest";
import WebSocket from "ws";
import { GatewayClient, startFakeGateway, type FakeGatewayHandle } from "./index.js";

describe("GatewayClient", () => {
  let fake: FakeGatewayHandle | null = null;

  afterEach(async () => {
    if (fake) {
      await fake.close();
      fake = null;
    }
  });

  it("connects and performs handshake", async () => {
    fake = await startFakeGateway({ token: "test-token" });
    const client = new GatewayClient({
      url: fake.url,
      token: "test-token",
      reconnect: false,
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    });

    const hello = await client.connect();
    expect(hello.type).toBe("hello-ok");
    expect(client.isConnected).toBe(true);

    const health = await client.call<{ ok: boolean }>("health");
    expect(health.ok).toBe(true);

    client.disconnect();
  });

  it("correlates RPC responses", async () => {
    fake = await startFakeGateway({ token: "test-token" });
    const client = new GatewayClient({
      url: fake.url,
      token: "test-token",
      reconnect: false,
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    });
    await client.connect();

    const agents = await client.call<{ agents: Array<{ id: string }> }>("agents.list");
    expect(agents.agents[0]?.id).toBe("main");

    client.disconnect();
  });

  it("serves repeatable approval-heavy scenario fixtures", async () => {
    fake = await startFakeGateway({ token: "test-token", scenario: "approval-heavy" });
    const client = new GatewayClient({
      url: fake.url,
      token: "test-token",
      reconnect: false,
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    });
    await client.connect();

    const approvals = await client.call<{ approvals: Array<{ id: string; status: string }> }>("exec.approval.list");
    expect(approvals.approvals).toHaveLength(3);
    expect(approvals.approvals.every((approval) => approval.status === "pending")).toBe(true);

    const resolved = await client.call<{ approval: { id: string; status: string } }>("exec.approval.resolve", {
      id: "approval-restart",
      decision: "approved",
    });
    expect(resolved.approval).toMatchObject({ id: "approval-restart", status: "approved" });

    client.disconnect();
  });

  it("receives pushed events", async () => {
    fake = await startFakeGateway({ token: "test-token" });
    const client = new GatewayClient({
      url: fake.url,
      token: "test-token",
      reconnect: false,
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    });

    const events: string[] = [];
    client.on("event", (name) => events.push(name));
    await client.connect();

    fake.emitEvent("agent", { stream: "tool", toolName: "read" });
    await new Promise((r) => setTimeout(r, 50));
    expect(events).toContain("agent");

    client.disconnect();
  });
});
