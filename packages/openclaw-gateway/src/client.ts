import { randomUUID } from "node:crypto";
import { RUNTIME_LIMITS } from "@dashclaw/runtime-model";
import { parseGatewayFrame, serializeGatewayFrame } from "./frame-limits.js";
import type {
  GatewayClientEvents,
  GatewayClientOptions,
  GatewayFrame,
  GatewayHandshakeState,
  HelloOkPayload,
} from "./types.js";

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
const POLICY_VIOLATION = 1008;

export const DEFAULT_GATEWAY_SCOPES = [
  "operator.read",
  "operator.write",
  "operator.admin",
  "operator.approvals",
  "operator.pairing",
] as const;

export const READ_ONLY_GATEWAY_SCOPES = ["operator.read"] as const;

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  if (/^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/.test(host)) return true;
  const octets = host.split(".");
  return octets.length === 4 && octets.every((octet) => /^\d{1,3}$/.test(octet)) && Number(octets[0]) === 127;
}

function validateGatewayUrl(rawUrl: string, allowInsecureRemote: boolean): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid Gateway URL");
  }

  if (url.username || url.password) {
    throw new Error("Gateway URL must not contain credentials");
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("Gateway URL must use ws:// or wss://");
  }
  if (url.protocol === "ws:" && !isLoopbackHost(url.hostname) && !allowInsecureRemote) {
    throw new Error(
      "Remote Gateway URL must use wss:// (set OPENCLAW_GATEWAY_ALLOW_INSECURE=1 only for trusted networks)",
    );
  }
}

function isValidChallenge(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const challenge = payload as Record<string, unknown>;
  return typeof challenge.nonce === "string" && challenge.nonce.length > 0 && Number.isFinite(challenge.ts);
}

function isHelloOk(payload: unknown): payload is HelloOkPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const hello = payload as Partial<HelloOkPayload>;
  return (
    hello.type === "hello-ok" &&
    typeof hello.protocol === "number" &&
    Boolean(hello.server) &&
    typeof hello.server === "object"
  );
}

interface PendingCall {
  generation: number;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingHandshake {
  generation: number;
  requestId: string;
  timer: ReturnType<typeof setTimeout>;
  reject: (error: Error) => void;
}

export class GatewayClient {
  private ws: WsLike | null = null;
  private pending = new Map<string, PendingCall>();
  private handshake: PendingHandshake | null = null;
  private listeners: Partial<{ [K in keyof GatewayClientEvents]: GatewayClientEvents[K][] }> = {};
  private state: GatewayHandshakeState = "disconnected";
  private intentionalClose = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private lastSeq: number | undefined;
  private hello: HelloOkPayload | null = null;
  private eventWindowStartedAt = Date.now();
  private eventCount = 0;
  private eventLimitReported = false;
  private lastFrameRejectionReportedAt = 0;
  private readonly createWebSocket: (url: string) => WsLike;

  constructor(private readonly options: GatewayClientOptions) {
    validateGatewayUrl(options.url, options.allowInsecureRemote === true);
    if (options.webSocketFactory) {
      this.createWebSocket = (url) =>
        options.webSocketFactory!(url, {
          maxPayload: RUNTIME_LIMITS.gateway.maxFrameBytes,
        }) as unknown as WsLike;
    } else {
      const WebSocketImpl = options.WebSocketImpl ?? WebSocket;
      this.createWebSocket = (url) => new WebSocketImpl(url) as unknown as WsLike;
    }
  }

  get isConnected(): boolean {
    return this.state === "authenticated";
  }

  get handshakeState(): GatewayHandshakeState {
    return this.state;
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
    if (this.state !== "disconnected") {
      throw new Error("Gateway connection already active");
    }
    this.clearReconnectTimer();
    this.intentionalClose = false;
    return this.openSocket();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    const ws = this.ws;
    const generation = this.generation;
    if (ws) {
      this.state = "closing";
      ws.close(1000, "client disconnect");
    }
    this.ws = null;
    this.generation += 1;
    this.state = "disconnected";
    this.hello = null;
    this.lastSeq = undefined;
    this.rejectGeneration(generation, new Error("Gateway disconnected"));
  }

  async call<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    const ws = this.ws;
    const generation = this.generation;
    if (!ws || ws.readyState !== WS_OPEN || this.state !== "authenticated") {
      throw new Error("Gateway not connected");
    }
    if (this.pending.size >= RUNTIME_LIMITS.gateway.maxPendingRequests) {
      throw new Error("Gateway request backlog limit reached");
    }
    const id = randomUUID();
    const frame: GatewayFrame = { type: "req", id, method, params };
    const serialized = serializeGatewayFrame(frame);
    const timeout = timeoutMs ?? this.options.requestTimeoutMs ?? 30_000;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending || pending.generation !== generation) return;
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeout);

      this.pending.set(id, {
        generation,
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });

      try {
        ws.send(serialized);
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`Gateway RPC send failed: ${method}`));
      }
    });
  }

  private async openSocket(): Promise<HelloOkPayload> {
    const generation = ++this.generation;
    this.state = "connecting";
    this.hello = null;
    this.lastSeq = undefined;

    return new Promise((resolve, reject) => {
      let ws: WsLike;
      try {
        ws = this.createWebSocket(this.options.url);
      } catch {
        this.state = "disconnected";
        reject(new Error("Failed to create Gateway WebSocket"));
        return;
      }
      this.ws = ws;
      let settled = false;

      const resolveConnect = (hello: HelloOkPayload) => {
        if (settled) return;
        settled = true;
        resolve(hello);
      };
      const rejectConnect = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      ws.onopen = () => {
        if (!this.isCurrent(ws, generation)) return;
      };

      ws.onmessage = (ev) => {
        if (!this.isCurrent(ws, generation)) return;
        const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
        let frame: GatewayFrame;
        try {
          frame = parseGatewayFrame(raw);
        } catch (err) {
          this.reportFrameRejection(err);
          if (this.state !== "authenticated") {
            this.failPreAuth(ws, generation, rejectConnect, "Invalid frame before authentication");
          }
          return;
        }

        if (this.state !== "authenticated") {
          this.handlePreAuthFrame(frame, ws, generation, resolveConnect, rejectConnect);
          return;
        }

        this.handleAuthenticatedFrame(frame, ws, generation);
      };

      ws.onclose = (ev) => {
        if (!this.isCurrent(ws, generation)) return;
        this.ws = null;
        this.state = "disconnected";
        this.hello = null;
        this.lastSeq = undefined;
        this.rejectGeneration(generation, new Error("Gateway connection closed"));
        rejectConnect(new Error("Gateway connection closed before authentication"));
        const reason = `code ${ev.code ?? "unknown"}`;
        this.emit("disconnected", reason);

        if (!this.intentionalClose && this.options.reconnect !== false) {
          this.scheduleReconnect(generation);
        }
      };

      ws.onerror = () => {
        if (!this.isCurrent(ws, generation)) return;
        const err = new Error("Gateway WebSocket error");
        if (this.state !== "authenticated") {
          this.failPreAuth(ws, generation, rejectConnect, err.message);
          return;
        }
        this.emit("error", err);
      };
    });
  }

  private handlePreAuthFrame(
    frame: GatewayFrame,
    ws: WsLike,
    generation: number,
    resolveConnect: (hello: HelloOkPayload) => void,
    rejectConnect: (error: Error) => void,
  ): void {
    if (this.state === "connecting") {
      if (frame.type !== "event" || frame.event !== "connect.challenge" || !isValidChallenge(frame.payload)) {
        this.failPreAuth(ws, generation, rejectConnect, "Expected a valid Gateway challenge");
        return;
      }
      this.state = "challenged";
      this.sendHandshake(ws, generation, rejectConnect);
      return;
    }

    if (this.state === "challenged") {
      const handshake = this.handshake;
      if (
        frame.type !== "res" ||
        !handshake ||
        handshake.generation !== generation ||
        frame.id !== handshake.requestId
      ) {
        this.failPreAuth(ws, generation, rejectConnect, "Unexpected frame during Gateway authentication");
        return;
      }

      clearTimeout(handshake.timer);
      this.handshake = null;
      if (!frame.ok) {
        this.failPreAuth(ws, generation, rejectConnect, "Gateway authentication failed");
        return;
      }
      if (!isHelloOk(frame.payload)) {
        this.failPreAuth(ws, generation, rejectConnect, "Invalid Gateway authentication response");
        return;
      }

      this.state = "authenticated";
      this.reconnectAttempt = 0;
      this.hello = frame.payload;
      this.lastSeq = undefined;
      this.emit("connected", frame.payload);
      resolveConnect(frame.payload);
      return;
    }

    this.failPreAuth(ws, generation, rejectConnect, "Unexpected Gateway handshake state");
  }

  private sendHandshake(
    ws: WsLike,
    generation: number,
    rejectConnect: (error: Error) => void,
  ): void {
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
      scopes: this.options.scopes ?? [...DEFAULT_GATEWAY_SCOPES],
      caps: ["tool-events"],
      locale: "en-US",
      userAgent: "dashclaw/0.1.0",
    };

    if (this.options.token) {
      params.auth = { token: this.options.token };
    } else if (this.options.password) {
      params.auth = { password: this.options.password };
    }

    const requestId = randomUUID();
    const timer = setTimeout(() => {
      const handshake = this.handshake;
      if (
        !handshake ||
        handshake.generation !== generation ||
        handshake.requestId !== requestId ||
        !this.isCurrent(ws, generation)
      ) {
        return;
      }
      this.handshake = null;
      this.failPreAuth(ws, generation, rejectConnect, "Gateway authentication timed out");
    }, 15_000);

    this.handshake = { generation, requestId, timer, reject: rejectConnect };
    try {
      ws.send(
        serializeGatewayFrame({
          type: "req",
          id: requestId,
          method: "connect",
          params,
        }),
      );
    } catch {
      clearTimeout(timer);
      this.handshake = null;
      this.failPreAuth(ws, generation, rejectConnect, "Failed to send Gateway authentication request");
    }
  }

  private handleAuthenticatedFrame(frame: GatewayFrame, ws: WsLike, generation: number): void {
    if (frame.type === "event") {
      if (frame.event === "connect.challenge") {
        this.emit("error", new Error("Duplicate Gateway challenge after authentication"));
        this.closeGeneration(ws, generation, POLICY_VIOLATION, "protocol violation");
        return;
      }

      if (!this.acceptGatewayEvent()) return;

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
      if (!pending || pending.generation !== generation) return;
      clearTimeout(pending.timer);
      this.pending.delete(frame.id);
      if (frame.ok) {
        pending.resolve(frame.payload);
      } else {
        const message = frame.error?.message ?? frame.error?.code ?? "RPC failed";
        pending.reject(new Error(message));
      }
      return;
    }

    this.emit("error", new Error("Unexpected Gateway request frame"));
    this.closeGeneration(ws, generation, POLICY_VIOLATION, "protocol violation");
  }

  private failPreAuth(
    ws: WsLike,
    generation: number,
    rejectConnect: (error: Error) => void,
    message: string,
  ): void {
    const error = new Error(message);
    rejectConnect(error);
    this.emit("error", error);
    this.closeGeneration(ws, generation, POLICY_VIOLATION, "authentication failed");
  }

  private closeGeneration(ws: WsLike, generation: number, code: number, reason: string): void {
    if (!this.isCurrent(ws, generation)) return;
    this.state = "closing";
    this.rejectGeneration(generation, new Error("Gateway connection closed"));
    ws.close(code, reason);
  }

  private scheduleReconnect(closedGeneration: number): void {
    this.clearReconnectTimer();
    const base = this.options.reconnectDelayMs ?? 1000;
    const max = this.options.maxReconnectDelayMs ?? 30_000;
    const delay = Math.min(base * 2 ** this.reconnectAttempt, max);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (
        !this.intentionalClose &&
        this.generation === closedGeneration &&
        this.state === "disconnected"
      ) {
        void this.openSocket().catch((err) => this.emit("error", err instanceof Error ? err : new Error(String(err))));
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private rejectGeneration(generation: number, error: Error): void {
    for (const [id, pending] of this.pending) {
      if (pending.generation !== generation) continue;
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
    if (this.handshake?.generation === generation) {
      clearTimeout(this.handshake.timer);
      this.handshake.reject(error);
      this.handshake = null;
    }
  }

  private isCurrent(ws: WsLike, generation: number): boolean {
    return this.ws === ws && this.generation === generation;
  }

  private acceptGatewayEvent(): boolean {
    const now = Date.now();
    if (now - this.eventWindowStartedAt >= 1_000) {
      this.eventWindowStartedAt = now;
      this.eventCount = 0;
      this.eventLimitReported = false;
    }
    this.eventCount += 1;
    if (this.eventCount <= RUNTIME_LIMITS.gateway.maxEventsPerSecond) return true;
    if (!this.eventLimitReported) {
      this.eventLimitReported = true;
      this.emit("error", new Error("Gateway event rate exceeded; excess events dropped"));
    }
    return false;
  }

  private reportFrameRejection(err: unknown): void {
    const now = Date.now();
    if (now - this.lastFrameRejectionReportedAt < 1_000) return;
    this.lastFrameRejectionReportedAt = now;
    this.emit(
      "error",
      err instanceof Error ? err : new Error("Gateway frame rejected"),
    );
  }
}

export * from "./types.js";
export * from "./fake-gateway.js";
export * from "./frame-limits.js";
