import { describe, expect, it, afterEach } from "vitest";
import WebSocket from "ws";
import { RUNTIME_LIMITS } from "@dashclaw/runtime-model";
import {
  GatewayClient,
  GatewayFrameLimitError,
  READ_ONLY_GATEWAY_SCOPES,
  parseGatewayFrame,
  startFakeGateway,
  type FakeGatewayHandle,
} from "./index.js";

class ControlledWebSocket {
  static instances: ControlledWebSocket[] = [];

  readyState = 0;
  sent: string[] = [];
  closes: Array<{ code?: number; reason?: string }> = [];
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string | URL) {
    void url;
    ControlledWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closes.push({ code, reason });
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({} as Event);
  }

  receive(frame: unknown): void {
    this.onmessage?.({ data: typeof frame === "string" ? frame : JSON.stringify(frame) });
  }

  emitClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  emitError(): void {
    this.onerror?.({} as Event);
  }
}

const ControlledWebSocketImpl = ControlledWebSocket as unknown as typeof globalThis.WebSocket;

function challenge(socket: ControlledWebSocket): { id: string } {
  socket.receive({
    type: "event",
    event: "connect.challenge",
    payload: { nonce: "test-nonce", ts: Date.now() },
  });
  return JSON.parse(socket.sent.at(-1) ?? "{}") as { id: string };
}

function authenticate(socket: ControlledWebSocket, connId: string): void {
  const connect = challenge(socket);
  socket.receive({
    type: "res",
    id: connect.id,
    ok: true,
    payload: { type: "hello-ok", protocol: 4, server: { version: "test", connId } },
  });
}

async function waitForControlledSocket(index: number): Promise<ControlledWebSocket> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const socket = ControlledWebSocket.instances[index];
    if (socket) return socket;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`Controlled WebSocket ${index} was not created`);
}

describe("GatewayClient", () => {
  let fake: FakeGatewayHandle | null = null;

  afterEach(async () => {
    if (fake) {
      await fake.close();
      fake = null;
    }
    ControlledWebSocket.instances = [];
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

  it("requests no write or admin scopes in read-only mode", async () => {
    fake = await startFakeGateway({ token: "test-token" });
    const client = new GatewayClient({
      url: fake.url,
      token: "test-token",
      scopes: [...READ_ONLY_GATEWAY_SCOPES],
      reconnect: false,
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    });

    await client.connect();

    expect(fake.getRequestedScopes()).toEqual(["operator.read"]);
    expect(fake.getRequestedScopes()).not.toContain("operator.write");
    expect(fake.getRequestedScopes()).not.toContain("operator.admin");

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

  it("serves realistic Discord workflow fixtures", async () => {
    fake = await startFakeGateway({ token: "test-token", scenario: "discord-workflow" });
    const client = new GatewayClient({
      url: fake.url,
      token: "test-token",
      reconnect: false,
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    });
    await client.connect();

    const sessions = await client.call<{ sessions: Array<{ key: string; parentSessionKey?: string; status?: string }> }>(
      "sessions.list",
    );
    const tasks = await client.call<{ tasks: Array<{ id: string; status: string; sessionKey?: string }> }>("tasks.list");
    const runningOrQueued = await client.call<{ tasks: Array<{ id: string; status: string }> }>("tasks.list", {
      status: ["running", "queued"],
    });
    const approvals = await client.call<{ approvals: Array<{ id: string; status: string; sessionKey?: string }> }>(
      "exec.approval.list",
    );

    expect(sessions.sessions).toHaveLength(7);
    expect(sessions.sessions.find((session) => session.key === "agent:dashclaw:discord:thread:work-board")).toMatchObject({
      parentSessionKey: "agent:dashclaw:discord:channel:1519213500986036264",
    });
    expect(sessions.sessions.find((session) => session.key === "agent:dashclaw:discord:thread:work-board:subagent:model")).toMatchObject({
      parentSessionKey: "agent:dashclaw:discord:thread:work-board",
    });
    expect(tasks.tasks.map((task) => task.status).sort()).toEqual([
      "completed",
      "failed",
      "queued",
      "running",
      "running",
      "running",
      "timed_out",
    ]);
    expect(runningOrQueued.tasks).toHaveLength(4);
    expect(approvals.approvals).toEqual([
      expect.objectContaining({
        id: "approval-discord-thread-test",
        status: "pending",
        sessionKey: "agent:coder:acp:TASK-039-coding-lane",
      }),
    ]);

    client.disconnect();
  });

  it("serves live-shaped task progress, results, lineage, runtime, and missing-summary variants", async () => {
    fake = await startFakeGateway({ token: "test-token", scenario: "task-contract" });
    const client = new GatewayClient({
      url: fake.url,
      token: "test-token",
      reconnect: false,
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    });
    await client.connect();

    const result = await client.call<{ tasks: Array<Record<string, unknown>> }>("tasks.list");
    expect(result.tasks).toHaveLength(82);
    expect(result.tasks.find((task) => task.id === "task-contract-running")).toMatchObject({
      progressSummary: "Inspecting task lifecycle and result fields",
      ownerKey: "agent:main:main",
      childSessionKey: "agent:worker:subagent",
      flowId: "flow-contract",
      runtime: expect.any(Object),
    });
    expect(result.tasks.find((task) => task.id === "task-contract-success")).toMatchObject({
      terminalSummary: "Validated all supported task fields",
    });
    expect(result.tasks.find((task) => task.id === "task-contract-failed")?.error).toEqual({
      message: "Task schema mismatch",
      code: "TASK_SCHEMA_MISMATCH",
      kind: "validation",
      stack: "not exposed",
    });
    expect(result.tasks.find((task) => task.id === "task-contract-missing-summary")).not.toHaveProperty("terminalSummary");

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

  it("serves the real sessions.preview contract and realistic assistant streams", async () => {
    fake = await startFakeGateway({ token: "test-token" });
    const client = new GatewayClient({
      url: fake.url,
      token: "test-token",
      reconnect: false,
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    });
    const events: Array<{ name: string; payload: unknown }> = [];
    client.on("event", (name, payload) => events.push({ name, payload }));
    await client.connect();

    const preview = await client.call<{
      previews: Array<{ key: string; items: Array<{ role: string; text: string }> }>;
    }>("sessions.preview", { keys: ["agent:main:main"], limit: 20 });
    expect(preview.previews).toEqual([
      expect.objectContaining({
        key: "agent:main:main",
        items: expect.arrayContaining([
          expect.objectContaining({ role: "assistant", text: "Preview for Main" }),
        ]),
      }),
    ]);

    fake.emitAssistantSequence();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events.map((event) => event.name)).toEqual(expect.arrayContaining(["chat", "session.tool"]));
    expect(events.filter((event) => event.name === "chat")).toHaveLength(3);

    events.length = 0;
    fake.emitStreamContractSequence();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events.filter((event) => event.name === "chat")).toHaveLength(5);
    expect(events.find((event) => event.name === "agent")?.payload).toMatchObject({
      stream: "tool",
      spawnedBy: "agent:main:main",
      data: {
        sessionKey: "agent:main:main",
        toolName: "read",
        phase: "completed",
      },
    });
    expect(events.filter((event) => event.name === "chat").map((event) => event.payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: "final", replace: true, usage: expect.any(Object) }),
        expect.objectContaining({ state: "aborted", stopReason: "operator" }),
        expect.objectContaining({ state: "error", errorKind: "provider" }),
      ]),
    );

    client.disconnect();
  });

  it.each([
    {
      name: "ordinary event",
      frame: { type: "event", event: "agent", payload: { injected: true }, seq: 1 },
    },
    {
      name: "response before challenge",
      frame: { type: "res", id: "attacker", ok: true, payload: { type: "hello-ok" } },
    },
    {
      name: "malformed JSON",
      frame: "{not-json",
    },
  ])("fails closed on a hostile pre-auth $name", async ({ frame }) => {
    const client = new GatewayClient({
      url: "ws://127.0.0.1:18789",
      reconnect: false,
      WebSocketImpl: ControlledWebSocketImpl,
    });
    const events: string[] = [];
    client.on("event", (name) => events.push(name));

    const connecting = client.connect();
    const socket = ControlledWebSocket.instances[0]!;
    socket.open();
    socket.receive(frame);

    await expect(connecting).rejects.toThrow();
    expect(events).toEqual([]);
    expect(socket.closes).toEqual([{ code: 1008, reason: "authentication failed" }]);
  });

  it("rejects duplicate challenges and mismatched connect responses", async () => {
    const duplicateClient = new GatewayClient({
      url: "ws://localhost:18789",
      reconnect: false,
      WebSocketImpl: ControlledWebSocketImpl,
    });
    const duplicateConnect = duplicateClient.connect();
    const duplicateSocket = ControlledWebSocket.instances[0]!;
    duplicateSocket.open();
    challenge(duplicateSocket);
    duplicateSocket.receive({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "second", ts: Date.now() },
    });

    await expect(duplicateConnect).rejects.toThrow("Unexpected frame during Gateway authentication");
    expect(duplicateSocket.sent).toHaveLength(1);
    expect(duplicateSocket.closes[0]?.code).toBe(1008);

    const mismatchClient = new GatewayClient({
      url: "ws://[::1]:18789",
      reconnect: false,
      WebSocketImpl: ControlledWebSocketImpl,
    });
    const mismatchConnect = mismatchClient.connect();
    const mismatchSocket = ControlledWebSocket.instances[1]!;
    mismatchSocket.open();
    challenge(mismatchSocket);
    mismatchSocket.receive({
      type: "res",
      id: "wrong-request",
      ok: true,
      payload: { type: "hello-ok", protocol: 4, server: {} },
    });

    await expect(mismatchConnect).rejects.toThrow("Unexpected frame during Gateway authentication");
    expect(mismatchSocket.closes[0]?.code).toBe(1008);
  });

  it("fails authentication without exposing Gateway-provided secret text", async () => {
    const client = new GatewayClient({
      url: "ws://127.0.0.1:18789",
      token: "super-secret-token",
      reconnect: false,
      WebSocketImpl: ControlledWebSocketImpl,
    });
    const errors: string[] = [];
    client.on("error", (error) => errors.push(error.message));

    const connecting = client.connect();
    const socket = ControlledWebSocket.instances[0]!;
    socket.open();
    const connect = challenge(socket);
    socket.receive({
      type: "res",
      id: connect.id,
      ok: false,
      error: { message: "bad token: super-secret-token" },
    });

    await expect(connecting).rejects.toThrow("Gateway authentication failed");
    expect(errors).toEqual(["Gateway authentication failed"]);
    expect(errors.join(" ")).not.toContain("super-secret-token");
  });

  it("fails closed on a WebSocket error before authentication", async () => {
    const client = new GatewayClient({
      url: "ws://127.0.0.1:18789",
      reconnect: false,
      WebSocketImpl: ControlledWebSocketImpl,
    });

    const connecting = client.connect();
    const socket = ControlledWebSocket.instances[0]!;
    socket.open();
    socket.emitError();

    await expect(connecting).rejects.toThrow("Gateway WebSocket error");
    expect(socket.closes[0]?.code).toBe(1008);
    expect(client.isConnected).toBe(false);
  });

  it("ignores stale socket callbacks, responses, and sequence state after reconnect", async () => {
    const client = new GatewayClient({
      url: "ws://127.0.0.1:18789",
      reconnectDelayMs: 1,
      maxReconnectDelayMs: 1,
      WebSocketImpl: ControlledWebSocketImpl,
    });
    const events: string[] = [];
    const disconnects: string[] = [];
    const errors: string[] = [];
    client.on("event", (name) => events.push(name));
    client.on("disconnected", (reason) => disconnects.push(reason));
    client.on("error", (error) => errors.push(error.message));

    const firstConnect = client.connect();
    const firstSocket = ControlledWebSocket.instances[0]!;
    firstSocket.open();
    authenticate(firstSocket, "generation-1");
    await firstConnect;
    firstSocket.receive({ type: "event", event: "first", seq: 10 });
    expect(client.lastEventSeq).toBe(10);

    const staleCall = client.call("health");
    firstSocket.emitClose();
    await expect(staleCall).rejects.toThrow("Gateway connection closed");

    const secondSocket = await waitForControlledSocket(1);
    secondSocket.open();
    authenticate(secondSocket, "generation-2");
    expect(client.isConnected).toBe(true);
    expect(client.helloOk?.server.connId).toBe("generation-2");
    expect(client.lastEventSeq).toBeUndefined();

    const currentCall = client.call<{ source: string }>("health");
    const currentRequest = JSON.parse(secondSocket.sent.at(-1) ?? "{}") as { id: string };
    firstSocket.receive({ type: "res", id: currentRequest.id, ok: true, payload: { source: "stale" } });
    firstSocket.receive({ type: "event", event: "stale", seq: 99 });
    firstSocket.emitClose(1001);
    secondSocket.receive({ type: "res", id: currentRequest.id, ok: true, payload: { source: "current" } });
    secondSocket.receive({ type: "event", event: "second", seq: 1 });

    await expect(currentCall).resolves.toEqual({ source: "current" });
    expect(client.isConnected).toBe(true);
    expect(client.lastEventSeq).toBe(1);
    expect(events).toEqual(["first", "second"]);
    expect(disconnects).toHaveLength(1);
    expect(errors.some((message) => message.includes("sequence gap"))).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(ControlledWebSocket.instances).toHaveLength(2);

    client.disconnect();
  });

  it("passes the frame byte limit to an injected transport factory", async () => {
    let maxPayload: number | undefined;
    const client = new GatewayClient({
      url: "ws://127.0.0.1:18789",
      reconnect: false,
      webSocketFactory: (url, options) => {
        maxPayload = options.maxPayload;
        return new ControlledWebSocket(url) as unknown as globalThis.WebSocket;
      },
    });

    const connecting = client.connect();
    const socket = ControlledWebSocket.instances[0]!;
    socket.open();
    authenticate(socket, "factory-limited");
    await connecting;

    expect(maxPayload).toBe(RUNTIME_LIMITS.gateway.maxFrameBytes);
    client.disconnect();
  });

  it("enforces Gateway URL transport and credential policy", () => {
    const options = { reconnect: false, WebSocketImpl: ControlledWebSocketImpl };

    expect(() => new GatewayClient({ ...options, url: "ws://gateway.example.com:18789" })).toThrow(
      "Remote Gateway URL must use wss://",
    );
    expect(
      () =>
        new GatewayClient({
          ...options,
          url: "ws://gateway.example.com:18789",
          allowInsecureRemote: true,
        }),
    ).not.toThrow();
    expect(() => new GatewayClient({ ...options, url: "wss://gateway.example.com:18789" })).not.toThrow();
    expect(() => new GatewayClient({ ...options, url: "ws://127.42.0.1:18789" })).not.toThrow();
    expect(() => new GatewayClient({ ...options, url: "ws://[::ffff:127.42.0.1]:18789" })).not.toThrow();
    expect(() => new GatewayClient({ ...options, url: "ws://service.localhost:18789" })).not.toThrow();
    expect(() => new GatewayClient({ ...options, url: "ws://[::ffff:126.255.255.255]:18789" })).toThrow(
      "Remote Gateway URL must use wss://",
    );
    expect(() => new GatewayClient({ ...options, url: "wss://user:secret@gateway.example.com" })).toThrow(
      "Gateway URL must not contain credentials",
    );
  });

  it("rejects oversized, deep, and excessive-cardinality frames safely", () => {
    const oversized = JSON.stringify({
      type: "event",
      event: "health",
      payload: "x".repeat(RUNTIME_LIMITS.gateway.maxFrameBytes),
    });
    expect(() => parseGatewayFrame(oversized)).toThrow(GatewayFrameLimitError);

    let atDepthLimit: Record<string, unknown> = {};
    for (let index = 0; index < RUNTIME_LIMITS.gateway.maxJsonDepth - 2; index += 1) {
      atDepthLimit = { child: atDepthLimit };
    }
    expect(() =>
      parseGatewayFrame(
        JSON.stringify({ type: "event", event: "health", payload: atDepthLimit }),
      ),
    ).not.toThrow();
    expect(() =>
      parseGatewayFrame(
        JSON.stringify({
          type: "event",
          event: "health",
          payload: { child: atDepthLimit },
        }),
      ),
    ).toThrow(/depth/);

    expect(() =>
      parseGatewayFrame(
        JSON.stringify({
          type: "event",
          event: "health",
          payload: Array.from(
            { length: RUNTIME_LIMITS.gateway.maxArrayItems + 1 },
            () => null,
          ),
        }),
      ),
    ).toThrow(/cardinality/);
  });

  it("rejects outbound RPC frames over the byte budget before sending", async () => {
    fake = await startFakeGateway({ token: "test-token" });
    const client = new GatewayClient({
      url: fake.url,
      token: "test-token",
      reconnect: false,
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    });
    await client.connect();
    await expect(
      client.call("health", { value: "x".repeat(RUNTIME_LIMITS.gateway.maxFrameBytes) }),
    ).rejects.toThrow(/byte limit/);
    client.disconnect();
  });

  it("drops Gateway event bursts beyond the per-second ingestion budget", async () => {
    fake = await startFakeGateway({ token: "test-token" });
    const client = new GatewayClient({
      url: fake.url,
      token: "test-token",
      reconnect: false,
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    });
    const events: string[] = [];
    const errors: string[] = [];
    client.on("event", (name) => events.push(name));
    client.on("error", (error) => errors.push(error.message));
    await client.connect();

    for (let index = 0; index < RUNTIME_LIMITS.gateway.maxEventsPerSecond + 25; index += 1) {
      fake.emitEvent("health", { ok: true, sequence: index });
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(events).toHaveLength(RUNTIME_LIMITS.gateway.maxEventsPerSecond);
    expect(errors.filter((message) => message.includes("event rate exceeded"))).toHaveLength(1);
    client.disconnect();
  });
});
