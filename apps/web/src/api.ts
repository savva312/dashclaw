import type {
  AuditLogEntry,
  RuntimeSnapshot,
  TimelineEvent,
} from "@dashclaw/runtime-model";
import { RUNTIME_LIMITS, safeOutputString } from "@dashclaw/runtime-model";
import {
  parseAuditResponse,
  parseBoundedJsonText,
  parseConfirmation,
  parseCronRuns,
  parseRpcResult,
  parseSessionPreview,
  parseSnapshot,
  parseSseAudit,
  parseSseSnapshot,
  parseSseTimeline,
  parseTimelineResponse,
  type SessionPreviewData,
} from "./validation";

const TOKEN_KEY = "dashclaw_token";

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function registerUnauthorizedHandler(handler: () => void): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}

export function getToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function isAuthError(err: unknown): boolean {
  return err instanceof AuthError || (err instanceof Error && err.message === "Unauthorized");
}

async function apiFetch<T>(
  path: string,
  init: RequestInit,
  validate: (value: unknown) => T,
): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) {
    notifyUnauthorized();
    throw new AuthError();
  }
  const body = await readBoundedResponse(res);
  if (!res.ok) {
    const error = body && typeof body === "object" && !Array.isArray(body)
      ? (body as { error?: unknown }).error
      : undefined;
    throw new Error(
      typeof error === "string"
        ? safeOutputString(error, 500)
        : res.statusText,
    );
  }
  return validate(body);
}

async function readBoundedResponse(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("Content-Length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > RUNTIME_LIMITS.browser.maxApiResponseBytes
  ) {
    await response.body?.cancel();
    throw new Error("API response exceeds byte limit");
  }

  if (!response.body) {
    return parseBoundedJsonText(await response.text(), "API response");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > RUNTIME_LIMITS.browser.maxApiResponseBytes) {
      await reader.cancel();
      throw new Error("API response exceeds byte limit");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return parseBoundedJsonText(new TextDecoder().decode(bytes), "API response");
}

export async function fetchSnapshot(): Promise<RuntimeSnapshot> {
  return apiFetch("/api/snapshot", {}, parseSnapshot);
}

export async function fetchTimeline(limit = 200): Promise<TimelineEvent[]> {
  return apiFetch(`/api/timeline?limit=${limit}`, {}, parseTimelineResponse);
}

export async function fetchAudit(): Promise<AuditLogEntry[]> {
  return apiFetch("/api/audit", {}, parseAuditResponse);
}

export async function refreshGateway(): Promise<RuntimeSnapshot> {
  return apiFetch("/api/gateway/refresh", { method: "POST" }, parseSnapshot);
}

export async function fetchSessionPreview(key: string): Promise<SessionPreviewData> {
  return apiFetch(`/api/sessions/${encodeURIComponent(key)}/preview`, {}, parseSessionPreview);
}

export async function fetchCronRuns(jobId?: string): Promise<unknown> {
  const q = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
  return apiFetch(`/api/cron/runs${q}`, {}, parseCronRuns);
}

export async function requestConfirm(
  method: string,
  params?: Record<string, unknown>,
): Promise<{ confirmToken: string }> {
  return apiFetch("/api/admin/confirm", {
    method: "POST",
    body: JSON.stringify({ method, params }),
  }, parseConfirmation);
}

export async function executeRpc(
  method: string,
  params?: Record<string, unknown>,
  confirmToken?: string,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  return apiFetch("/api/admin/rpc", {
    method: "POST",
    body: JSON.stringify({ method, params, confirmToken }),
  }, parseRpcResult);
}

export const MAX_SSE_EVENT_CHARS = RUNTIME_LIMITS.browser.maxSseEventBytes;
const INITIAL_SSE_RECONNECT_MS = 1_000;
const MAX_SSE_RECONNECT_MS = 30_000;

type EventHandlers = {
  onSnapshot?: (s: RuntimeSnapshot) => void;
  onTimeline?: (e: TimelineEvent) => void;
  onAudit?: (entries: AuditLogEntry[]) => void;
};

type ParsedSseEvent = {
  event: string;
  data: string;
};

function dispatchSseEvent({ event, data }: ParsedSseEvent, handlers: EventHandlers): void {
  try {
    if (event === "snapshot") {
      handlers.onSnapshot?.(parseSseSnapshot(data));
    } else if (event === "timeline") {
      handlers.onTimeline?.(parseSseTimeline(data));
    } else if (event === "audit") {
      handlers.onAudit?.(parseSseAudit(data));
    }
  } catch {
    // Malformed or excessive events are ignored; polling remains authoritative.
  }
}

async function consumeEventStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onEvent: (event: ParsedSseEvent) => void,
  onRetry: (delayMs: number) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "";
  let dataLines: string[] = [];
  let dataChars = 0;

  const resetEvent = () => {
    eventName = "";
    dataLines = [];
    dataChars = 0;
  };

  const dispatch = () => {
    if (dataLines.length === 0) {
      resetEvent();
      return;
    }
    const event = { event: eventName || "message", data: dataLines.join("\n") };
    resetEvent();
    onEvent(event);
  };

  const processLine = (line: string) => {
    if (line.length > MAX_SSE_EVENT_CHARS) {
      throw new Error("SSE line exceeded the configured size limit");
    }
    if (line === "") {
      dispatch();
      return;
    }
    if (line.startsWith(":")) return;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") {
      eventName = value;
    } else if (field === "data") {
      dataChars += value.length + (dataLines.length > 0 ? 1 : 0);
      if (dataChars > MAX_SSE_EVENT_CHARS) {
        throw new Error("SSE event exceeded the configured size limit");
      }
      dataLines.push(value);
    } else if (field === "retry" && /^\d+$/.test(value)) {
      const parsed = Number(value);
      if (Number.isSafeInteger(parsed)) {
        onRetry(Math.min(MAX_SSE_RECONNECT_MS, Math.max(INITIAL_SSE_RECONNECT_MS, parsed)));
      }
    }
  };

  const drainLines = (atEnd: boolean) => {
    while (buffer.length > 0) {
      const lf = buffer.indexOf("\n");
      const cr = buffer.indexOf("\r");
      const lineEnd = lf === -1 ? cr : cr === -1 ? lf : Math.min(lf, cr);
      if (lineEnd === -1) break;
      if (!atEnd && buffer[lineEnd] === "\r" && lineEnd === buffer.length - 1) break;

      const isCrLf = buffer[lineEnd] === "\r" && buffer[lineEnd + 1] === "\n";
      const line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + (isCrLf ? 2 : 1));
      processLine(line);
    }

    if (buffer.length > MAX_SSE_EVENT_CHARS) {
      throw new Error("SSE buffer exceeded the configured size limit");
    }
    if (atEnd && buffer.length > 0) {
      const finalLine = buffer;
      buffer = "";
      processLine(finalLine);
    }
  };

  const cancelReader = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancelReader, { once: true });

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      drainLines(false);
    }

    if (!signal.aborted) {
      buffer += decoder.decode();
      drainLines(true);
      dispatch();
    }
  } finally {
    signal.removeEventListener("abort", cancelReader);
    reader.releaseLock();
  }
}

export function subscribeEvents(handlers: EventHandlers): () => void {
  const token = getToken();
  if (!token) {
    return () => {};
  }

  const controller = new AbortController();
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectDelay = INITIAL_SSE_RECONNECT_MS;

  const connect = async (): Promise<void> => {
    try {
      const response = await fetch("/api/events", {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.status === 401) {
        stopped = true;
        notifyUnauthorized();
        return;
      }
      if (!response.ok) {
        throw new Error(`Event stream request failed with status ${response.status}`);
      }
      if (!response.headers.get("Content-Type")?.toLowerCase().startsWith("text/event-stream")) {
        throw new Error("Event stream returned an invalid content type");
      }
      if (!response.body) {
        throw new Error("Event stream returned no response body");
      }

      reconnectDelay = INITIAL_SSE_RECONNECT_MS;
      await consumeEventStream(
        response.body,
        controller.signal,
        (event) => dispatchSseEvent(event, handlers),
        (delayMs) => {
          reconnectDelay = delayMs;
        },
      );
    } catch {
      // Polling remains active while transient stream failures reconnect.
    }

    if (stopped || controller.signal.aborted) return;
    const delay = reconnectDelay;
    reconnectDelay = Math.min(MAX_SSE_RECONNECT_MS, reconnectDelay * 2);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, delay);
  };

  void connect();

  return () => {
    stopped = true;
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
    controller.abort();
  };
}
