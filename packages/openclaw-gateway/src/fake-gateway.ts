import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

export interface FakeGatewayOptions {
  port?: number;
  token?: string;
}

export interface FakeGatewayHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
  emitEvent: (event: string, payload?: unknown) => void;
}

/** Minimal in-process Gateway mock for tests and offline development */
export async function startFakeGateway(options: FakeGatewayOptions = {}): Promise<FakeGatewayHandle> {
  const token = options.token ?? "test-token";
  const clients = new Set<WebSocket>();
  let seq = 0;

  const server: Server = createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "fake-openclaw-gateway" }));
  });

  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: "event", event: "connect.challenge", payload: { nonce: "test-nonce", ts: Date.now() } }));

    ws.on("message", (data) => {
      let frame: { type?: string; id?: string; method?: string; params?: Record<string, unknown> };
      try {
        frame = JSON.parse(String(data));
      } catch {
        return;
      }

      if (frame.type !== "req" || !frame.id || !frame.method) return;

      if (frame.method === "connect") {
        const auth = frame.params?.auth as { token?: string } | undefined;
        if (auth?.token !== token) {
          ws.send(JSON.stringify({ type: "res", id: frame.id, ok: false, error: { code: "UNAUTHORIZED", message: "unauthorized" } }));
          return;
        }
        ws.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: {
              type: "hello-ok",
              protocol: 4,
              server: { version: "fake-2026.6.0", connId: "fake-conn" },
              features: { methods: ["health", "agents.list", "sessions.list"], events: ["agent", "health"] },
              snapshot: { presence: [], health: { ok: true } },
              auth: { role: "operator", scopes: ["operator.read", "operator.write", "operator.admin"] },
              policy: { maxPayload: 26214400, tickIntervalMs: 15000 },
            },
          }),
        );
        return;
      }

      const responses: Record<string, unknown> = {
        health: { ok: true, uptimeMs: 12345, version: "fake-2026.6.0" },
        status: { runtime: "running" },
        "agents.list": { agents: [{ id: "main", name: "Main Agent", model: "openclaw/default" }] },
        "sessions.list": {
          sessions: [
            { key: "agent:main:main", agentId: "main", label: "Main", updatedAt: new Date().toISOString() },
          ],
        },
        "tasks.list": {
          tasks: [{ id: "task-1", status: "running", title: "Review PR", agentId: "main", sessionKey: "agent:main:main" }],
        },
        "cron.list": { jobs: [{ id: "cron-1", name: "Daily digest", enabled: true, schedule: "0 9 * * *" }] },
        "cron.runs": { runs: [] },
        "node.list": { nodes: [] },
        "exec.approval.list": { approvals: [] },
        "logs.tail": { lines: ["[info] fake gateway running"] },
      };

      const payload = responses[frame.method] ?? {};
      ws.send(JSON.stringify({ type: "res", id: frame.id, ok: true, payload }));
    });

    ws.on("close", () => clients.delete(ws));
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : (options.port ?? 0);

  return {
    url: `ws://127.0.0.1:${port}`,
    port,
    close: () =>
      new Promise((resolve) => {
        for (const ws of clients) ws.close();
        wss.close(() => server.close(() => resolve()));
      }),
    emitEvent: (event, payload) => {
      seq += 1;
      const msg = JSON.stringify({ type: "event", event, payload, seq });
      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) ws.send(msg);
      }
    },
  };
}
