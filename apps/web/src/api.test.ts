import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SSE_EVENT_CHARS,
  registerUnauthorizedHandler,
  setToken,
  subscribeEvents,
} from "./api";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}

function eventStreamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

describe("event stream", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createStorage());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses an Authorization header without putting credentials in the URL", async () => {
    const token = "dashboard-secret?with=url-characters";
    const snapshot = {
      gatewayId: "gateway-safe",
      connectionState: "connected",
      health: null,
      agents: [],
      sessions: [],
      tasks: [],
      cronJobs: [],
      approvals: [],
      nodes: [],
      activeRunCount: 0,
      pendingApprovalCount: 0,
      failedTaskCount: 0,
      updatedAt: "2026-07-21T00:00:00.000Z",
    };
    setToken(token);
    const fetchMock = vi.fn().mockResolvedValueOnce(
      eventStreamResponse([
        ": keepalive\r\n",
        "event: snap",
        `shot\r\ndata: ${JSON.stringify(snapshot)}\r\n\r\n`,
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const snapshots: unknown[] = [];
    const unsubscribe = subscribeEvents({
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    await vi.waitFor(() => {
      expect(snapshots).toEqual([snapshot]);
    });
    unsubscribe();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/events");
    expect(url).not.toContain(token);
    expect(url).not.toContain("token=");
    expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(new Headers(init.headers).get("Accept")).toBe("text/event-stream");
  });

  it("does not parse or reconnect an unauthorized response", async () => {
    setToken("wrong-token");
    const fetchMock = vi.fn().mockResolvedValue(
      eventStreamResponse(['event: snapshot\ndata: {"gatewayId":"must-not-leak"}\n\n'], 401),
    );
    vi.stubGlobal("fetch", fetchMock);
    const unauthorized = vi.fn();
    const unregister = registerUnauthorizedHandler(unauthorized);
    const onSnapshot = vi.fn();

    const unsubscribe = subscribeEvents({ onSnapshot });

    await vi.waitFor(() => {
      expect(unauthorized).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(onSnapshot).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unsubscribe();
    unregister();
  });

  it("reconnects transient failures with a bounded delay and aborts cleanly", async () => {
    vi.useFakeTimers();
    setToken("dashboard-token");
    let activeSignal: AbortSignal | undefined;
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network failure"))
      .mockImplementationOnce((_url: string, init: RequestInit) => {
        activeSignal = init.signal as AbortSignal;
        return new Promise<Response>(() => {});
      });
    vi.stubGlobal("fetch", fetchMock);

    const unsubscribe = subscribeEvents({});
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(activeSignal?.aborted).toBe(false);

    unsubscribe();
    expect(activeSignal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds oversized SSE input and reconnects without dispatching it", async () => {
    vi.useFakeTimers();
    setToken("dashboard-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(eventStreamResponse([`event: snapshot\ndata: ${"x".repeat(MAX_SSE_EVENT_CHARS + 1)}\n\n`]))
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const onSnapshot = vi.fn();

    const unsubscribe = subscribeEvents({ onSnapshot });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onSnapshot).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("keeps concurrent subscriptions independently abortable", () => {
    setToken("dashboard-token");
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const unsubscribeFirst = subscribeEvents({});
    const unsubscribeSecond = subscribeEvents({});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals[0]).not.toBe(signals[1]);

    unsubscribeFirst();
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    unsubscribeSecond();
    expect(signals[1]?.aborted).toBe(true);
  });
});
