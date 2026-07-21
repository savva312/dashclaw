export type GatewayFrame =
  | { type: "req"; id: string; method: string; params?: unknown }
  | { type: "res"; id: string; ok: boolean; payload?: unknown; error?: GatewayError }
  | { type: "event"; event: string; payload?: unknown; seq?: number; stateVersion?: unknown };

export interface GatewayError {
  code?: string;
  message?: string;
  details?: unknown;
}

export interface HelloOkPayload {
  type: "hello-ok";
  protocol: number;
  server: { version?: string; connId?: string };
  features?: { methods?: string[]; events?: string[] };
  snapshot?: Record<string, unknown>;
  auth?: { role?: string; scopes?: string[] };
  policy?: {
    maxPayload?: number;
    maxBufferedBytes?: number;
    tickIntervalMs?: number;
  };
}

export type GatewayHandshakeState =
  | "disconnected"
  | "connecting"
  | "challenged"
  | "authenticated"
  | "closing";

export interface GatewayWebSocketTransportOptions {
  maxPayload: number;
}

export type GatewayWebSocketFactory = (
  url: string,
  options: GatewayWebSocketTransportOptions,
) => WebSocket;

export interface GatewayClientOptions {
  url: string;
  token?: string;
  password?: string;
  scopes?: string[];
  /** OpenClaw-registered client id (default: gateway-client) */
  clientId?: string;
  /** OpenClaw client mode (default: backend) */
  clientMode?: string;
  reconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  requestTimeoutMs?: number;
  /** Allow plaintext ws:// for non-loopback hosts. Unsafe; use only on trusted networks. */
  allowInsecureRemote?: boolean;
  /** Create a transport with implementation-specific limits (for example ws maxPayload). */
  webSocketFactory?: GatewayWebSocketFactory;
  /** Inject WebSocket constructor (for tests) */
  WebSocketImpl?: typeof WebSocket;
}

export interface GatewayClientEvents {
  connected: (hello: HelloOkPayload) => void;
  disconnected: (reason: string) => void;
  event: (name: string, payload: unknown, meta: { seq?: number }) => void;
  error: (error: Error) => void;
}

export type GatewayEventHandler<K extends keyof GatewayClientEvents> = GatewayClientEvents[K];
