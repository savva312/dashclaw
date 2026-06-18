import type {
  AuditLogEntry,
  RuntimeSnapshot,
  TimelineEvent,
} from "@dashclaw/runtime-model";

const TOKEN_KEY = "dashclaw_token";
const IGNORE_ENV_KEY = "dashclaw_ignore_env_token";
const ENV_TOKEN = import.meta.env.VITE_DASHCLAW_TOKEN ?? import.meta.env.DASHCLAW_TOKEN ?? "";

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

export function getEnvToken(): string {
  return ENV_TOKEN;
}

export function shouldUseEnvToken(): boolean {
  if (sessionStorage.getItem(IGNORE_ENV_KEY) === "1") return false;
  return Boolean(ENV_TOKEN);
}

export function getToken(): string {
  const stored = sessionStorage.getItem(TOKEN_KEY);
  if (stored) return stored;
  if (shouldUseEnvToken()) return ENV_TOKEN;
  return "";
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.removeItem(IGNORE_ENV_KEY);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.setItem(IGNORE_ENV_KEY, "1");
}

export function isAuthError(err: unknown): boolean {
  return err instanceof AuthError || (err instanceof Error && err.message === "Unauthorized");
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function fetchSnapshot(): Promise<RuntimeSnapshot> {
  return apiFetch("/api/snapshot");
}

export async function fetchTimeline(limit = 200): Promise<TimelineEvent[]> {
  const data = await apiFetch<{ events: TimelineEvent[] }>(`/api/timeline?limit=${limit}`);
  return data.events;
}

export async function fetchAudit(): Promise<AuditLogEntry[]> {
  const data = await apiFetch<{ entries: AuditLogEntry[] }>("/api/audit");
  return data.entries;
}

export async function refreshGateway(): Promise<RuntimeSnapshot> {
  return apiFetch("/api/gateway/refresh", { method: "POST" });
}

export async function fetchSessionPreview(key: string): Promise<unknown> {
  return apiFetch(`/api/sessions/${encodeURIComponent(key)}/preview`);
}

export async function fetchCronRuns(jobId?: string): Promise<unknown> {
  const q = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
  return apiFetch(`/api/cron/runs${q}`);
}

export async function requestConfirm(method: string): Promise<{ confirmToken: string }> {
  return apiFetch("/api/admin/confirm", {
    method: "POST",
    body: JSON.stringify({ method }),
  });
}

export async function executeRpc(
  method: string,
  params?: Record<string, unknown>,
  confirmToken?: string,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  return apiFetch("/api/admin/rpc", {
    method: "POST",
    body: JSON.stringify({ method, params, confirmToken, actor: "dashclaw-ui" }),
  });
}

export function subscribeEvents(handlers: {
  onSnapshot?: (s: RuntimeSnapshot) => void;
  onTimeline?: (e: TimelineEvent) => void;
  onAudit?: (entries: AuditLogEntry[]) => void;
}): () => void {
  const token = getToken();
  if (!token) {
    return () => {};
  }

  const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);

  es.addEventListener("snapshot", (ev) => {
    handlers.onSnapshot?.(JSON.parse(ev.data) as RuntimeSnapshot);
  });
  es.addEventListener("timeline", (ev) => {
    handlers.onTimeline?.(JSON.parse(ev.data) as TimelineEvent);
  });
  es.addEventListener("audit", (ev) => {
    handlers.onAudit?.(JSON.parse(ev.data) as AuditLogEntry[]);
  });

  es.onerror = () => {
    // Transient SSE disconnects are handled by polling; avoid false logouts here.
  };

  return () => es.close();
}
