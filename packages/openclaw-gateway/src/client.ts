import { randomUUID } from "node:crypto";
import type { GatewayClientEvents, GatewayClientOptions, GatewayFrame, HelloOkPayload } from "./types.js";

type WsLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: Event) => void) | null;
};

const WS_OPEN = 1;

function parseFrame(raw: string): GatewayFrame | null {
  try {
    return JSON.parse(raw) as GatewayFrame;
  } catch {
    return null;
  }
}

export class GatewayClient {
  private ws: WsLike | null = null;
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private listeners: Partial<{ [K in keyof GatewayClientEvents]: GatewayClientEvents[K][] }> = {};
  private connected = false;
  private intentionalClose = false;
  private reconnectAttempt = 0;
  private lastSeq: number | undefined;
  private hello: HelloOkPayload | null = null;
  private readonly WebSocketImpl: typeof WebSocket;

  constructor(private readonly options: GatewayClientOptions) {
    this.WebSocketImpl = options.WebSocketImpl ?? WebSocket;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get helloOk(): HelloOkPayload | null {
    return this.hello;
  }

  get lastEventSeq(): number | undefined {
    return this.lastSeq;
  }

  on<K extends keyof GatewayClientEvents>(event: K, handler: GatewayClientEvents[K]): () => void {
    const list = (this.listeners[event] ??= []) as GatewayClientEvents[K][];
    list.push(handler);
    return () => {
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  private emit<K extends keyof GatewayClientEvents>(
    event: K,
    ...args: Parameters<GatewayClientEvents[K]>
  ): void {
    for (const handler of this.listeners[event] ?? []) {
      (handler as (...a: unknown[]) => void)(...args);
    }
  }

  async connect(): Promise<HelloOkPayload> {
    this.intentionalClose = false;
    return this.openSocket();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.ws?.close(1000, "client disconnect");
    this.ws = null;
    this.connected = false;
    this.rejectAllPending(new Error("Gateway disconnected"));
  }

  async call<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    if (!this.ws || this.ws.readyState !== WS_OPEN) {
      throw new Error("Gateway not connected");
    }
    if (!this.connected && method !== "connect") {
      throw new Error("Gateway not connected");
    }
    const id = randomUUID();
    const frame: GatewayFrame = { type: "req", id, method, params };
    const timeout = timeoutMs ?? this.options.requestTimeoutMs ?? 30_000;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeout);

      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });

      this.ws!.send(JSON.stringify(frame));
    });
  }

  private async openSocket(): Promise<HelloOkPayload> {
    return new Promise((resolve, reject) => {
      const ws = new this.WebSocketImpl(this.options.url) as unknown as WsLike;
      this.ws = ws;
      let settled = false;

      ws.onopen = () => {
        this.reconnectAttempt = 0;
      };

      ws.onmessage = (ev) => {
        const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
        const frame = parseFrame(raw);
        if (!frame) return;

        if (frame.type === "event") {
          if (frame.event === "connect.challenge") {
            void this.performHandshake().then(
              (hello) => {
                if (!settled) {
                  settled = true;
                  resolve(hello);
                }
              },
              (err) => {
                if (!settled) {
                  settled = true;
                  reject(err instanceof Error ? err : new Error(String(err)));
                }
              },
            );
            return;
          }

          if (frame.seq !== undefined) {
            if (this.lastSeq !== undefined && frame.seq > this.lastSeq + 1) {
              this.emit("error", new Error(`Event sequence gap: expected ${this.lastSeq + 1}, got ${frame.seq}`));
            }
            this.lastSeq = frame.seq;
          }

          this.emit("event", frame.event, frame.payload, { seq: frame.seq });
          return;
        }

        if (frame.type === "res") {
          const pending = this.pending.get(frame.id);
          if (!pending) return;
          clearTimeout(pending.timer);
          this.pending.delete(frame.id);
          if (frame.ok) {
            pending.resolve(frame.payload);
          } else {
            const msg = frame.error?.message ?? frame.error?.code ?? "RPC failed";
            pending.reject(new Error(msg));
          }
        }
      };

      ws.onclose = (ev) => {
        this.connected = false;
        this.hello = null;
        this.rejectAllPending(new Error("Gateway connection closed"));
        const reason = ev.reason || `code ${ev.code ?? "unknown"}`;
        this.emit("disconnected", reason);

        if (!this.intentionalClose && this.options.reconnect !== false) {
          this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        const err = new Error("Gateway WebSocket error");
        this.emit("error", err);
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
    });
  }

  private async performHandshake(): Promise<HelloOkPayload> {
    const params: Record<string, unknown> = {
      minProtocol: 4,
      maxProtocol: 4,
      client: {
        id: this.options.clientId ?? "gateway-client",
        displayName: "Dashclaw",
        version: "0.1.0",
        platform: "node",
        mode: this.options.clientMode ?? "backend",
      },
      role: "operator",
      scopes: this.options.scopes ?? [
        "operator.read",
        "operator.write",
        "operator.admin",
        "operator.approvals",
        "operator.pairing",
      ],
      caps: ["tool-events"],
      locale: "en-US",
      userAgent: "dashclaw/0.1.0",
    };

    if (this.options.token) {
      params.auth = { token: this.options.token };
    } else if (this.options.password) {
      params.auth = { password: this.options.password };
    }

    const payload = await this.call<HelloOkPayload>("connect", params, 15_000);
    if (payload?.type !== "hello-ok") {
      throw new Error("Invalid connect response");
    }
    this.connected = true;
    this.hello = payload;
    this.emit("connected", payload);
    return payload;
  }

  private scheduleReconnect(): void {
    const base = this.options.reconnectDelayMs ?? 1000;
    const max = this.options.maxReconnectDelayMs ?? 30_000;
    const delay = Math.min(base * 2 ** this.reconnectAttempt, max);
    this.reconnectAttempt += 1;
    setTimeout(() => {
      if (!this.intentionalClose) {
        void this.openSocket().catch((err) => this.emit("error", err instanceof Error ? err : new Error(String(err))));
      }
    }, delay);
  }

  private rejectAllPending(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}

export * from "./types.js";
export * from "./fake-gateway.js";
