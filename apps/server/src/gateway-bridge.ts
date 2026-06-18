import { randomUUID } from "node:crypto";
import { GatewayClient } from "@dashclaw/openclaw-gateway";
import WebSocket from "ws";
import type {
  AgentSummary,
  ApprovalSummary,
  CronJobSummary,
  GatewayConnectionState,
  NodeSummary,
  RuntimeSnapshot,
  SessionSummary,
  TaskSummary,
  TimelineEventKind,
} from "@dashclaw/runtime-model";
import { redactValue } from "@dashclaw/runtime-model";
import type { RuntimeStore } from "./runtime-store.js";

export interface GatewayBridgeOptions {
  url: string;
  token?: string;
  password?: string;
  gatewayId?: string;
  store: RuntimeStore;
}

export class GatewayBridge {
  readonly client: GatewayClient;
  private store: RuntimeStore;
  private gatewayId: string;
  private connectionState: GatewayConnectionState = "disconnected";
  private snapshot: RuntimeSnapshot;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private subscribedSessions = new Set<string>();
  private refreshInFlight = false;
  private refreshQueued = false;
  private debouncedRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private liveSessions = new Map<string, LiveSessionActivity>();
  private onSnapshot?: (snapshot: RuntimeSnapshot) => void;
  private onTimeline?: (event: ReturnType<RuntimeStore["appendTimeline"]>) => void;

  setEventHandlers(handlers: {
    onSnapshot?: (snapshot: RuntimeSnapshot) => void;
    onTimeline?: (event: ReturnType<RuntimeStore["appendTimeline"]>) => void;
  }): void {
    this.onSnapshot = handlers.onSnapshot;
    this.onTimeline = handlers.onTimeline;
  }

  constructor(options: GatewayBridgeOptions) {
    this.store = options.store;
    this.gatewayId = options.gatewayId ?? "default";
    this.snapshot = emptySnapshot(this.gatewayId);

    this.client = new GatewayClient({
      url: options.url,
      token: options.token,
      password: options.password,
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    });

    this.client.on("connected", (hello) => {
      this.connectionState = "connected";
      this.recordTimeline("gateway.connected", "Gateway connected", `v${hello.server.version ?? "unknown"}`);
      void this.setupLiveSubscriptions().then(() => this.refreshSnapshot());
      this.startRefreshLoop();
    });

    this.client.on("disconnected", (reason) => {
      this.connectionState = "disconnected";
      this.subscribedSessions.clear();
      this.liveSessions.clear();
      this.snapshot = { ...this.snapshot, connectionState: "disconnected", updatedAt: new Date().toISOString() };
      this.publishSnapshot();
      this.recordTimeline("gateway.disconnected", "Gateway disconnected", reason, "warn");
      this.stopRefreshLoop();
    });

    this.client.on("event", (name, payload) => {
      this.handleGatewayEvent(name, payload);
    });

    this.client.on("error", (err) => {
      this.recordTimeline("gateway.disconnected", "Gateway error", err.message, "error");
    });
  }

  getSnapshot(): RuntimeSnapshot {
    return this.snapshot;
  }

  getConnectionState(): GatewayConnectionState {
    return this.connectionState;
  }

  async start(): Promise<void> {
    this.connectionState = "connecting";
    this.snapshot = { ...this.snapshot, connectionState: "connecting", updatedAt: new Date().toISOString() };
    this.publishSnapshot();
    try {
      await this.client.connect();
    } catch {
      this.connectionState = "disconnected";
      this.snapshot = { ...this.snapshot, connectionState: "disconnected", updatedAt: new Date().toISOString() };
      this.publishSnapshot();
      throw new Error("Gateway connect failed");
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.stopRefreshLoop();
    if (this.debouncedRefreshTimer) clearTimeout(this.debouncedRefreshTimer);
    this.client.disconnect();
  }

  async rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
    return this.client.call<T>(method, params);
  }

  private async setupLiveSubscriptions(): Promise<void> {
    try {
      await this.client.call("sessions.subscribe");
    } catch {
      /* optional on older gateways */
    }
  }

  private async syncSessionMessageSubscriptions(sessions: SessionSummary[]): Promise<void> {
    const targets = sessions
      .filter((s) => s.isActive || isRecentSession(s.updatedAt))
      .slice(0, 25);

    for (const session of targets) {
      if (this.subscribedSessions.has(session.key)) continue;
      try {
        await this.client.call("sessions.messages.subscribe", {
          key: session.key,
          ...(session.agentId ? { agentId: session.agentId } : {}),
        });
        this.subscribedSessions.add(session.key);
      } catch {
        /* session may have been pruned */
      }
    }
  }

  private startRefreshLoop(): void {
    this.stopRefreshLoop();
    const tick = () => {
      void this.refreshSnapshot();
      const intervalMs = this.snapshot.activeRunCount > 0 ? 2_000 : 5_000;
      this.refreshTimer = setTimeout(tick, intervalMs);
    };
    this.refreshTimer = setTimeout(tick, 1_000);
  }

  private stopRefreshLoop(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private scheduleRefreshSnapshot(): void {
    if (this.debouncedRefreshTimer) clearTimeout(this.debouncedRefreshTimer);
    this.debouncedRefreshTimer = setTimeout(() => {
      this.debouncedRefreshTimer = null;
      void this.refreshSnapshot();
    }, 250);
  }

  async refreshSnapshot(): Promise<RuntimeSnapshot> {
    if (this.refreshInFlight) {
      this.refreshQueued = true;
      return this.snapshot;
    }
    this.refreshInFlight = true;
    try {
      const [health, agentsRes, sessionsRes, tasksRes, runningTasksRes, cronRes, nodesRes, approvalsRes] =
        await Promise.all([
          this.client.call<Record<string, unknown>>("health").catch(() => null),
          this.client.call<{ agents?: unknown[] }>("agents.list").catch(() => ({ agents: [] })),
          this.client.call<{ sessions?: unknown[] }>("sessions.list").catch(() => ({ sessions: [] })),
          this.client.call<{ tasks?: unknown[] }>("tasks.list", { limit: 100 }).catch(() => ({ tasks: [] })),
          this.client
            .call<{ tasks?: unknown[] }>("tasks.list", { limit: 50, status: ["running", "queued"] })
            .catch(() => ({ tasks: [] })),
          this.client.call<{ jobs?: unknown[] }>("cron.list").catch(() => ({ jobs: [] })),
          this.client.call<{ nodes?: unknown[] }>("node.list").catch(() => ({ nodes: [] })),
          this.client.call<{ approvals?: unknown[] }>("exec.approval.list").catch(() => ({ approvals: [] })),
        ]);

      const agents = (agentsRes.agents ?? []).map(normalizeAgent);
      const sessions = this.applyLiveSessions((sessionsRes.sessions ?? []).map(normalizeSession));
      const taskMap = new Map<string, TaskSummary>();
      for (const raw of [...(tasksRes.tasks ?? []), ...(runningTasksRes.tasks ?? [])]) {
        const task = normalizeTask(raw);
        taskMap.set(task.id, task);
      }
      const tasks = [...taskMap.values()].sort((a, b) => rankTask(b) - rankTask(a));
      const cronJobs = (cronRes.jobs ?? []).map(normalizeCron);
      const nodes = (nodesRes.nodes ?? []).map(normalizeNode);
      const approvals = (approvalsRes.approvals ?? []).map(normalizeApproval);

      const runningTasks = tasks.filter((t) => t.status === "running").length;
      const activeSessions = sessions.filter((s) => s.isActive).length;
      const activeRunCount = Math.max(runningTasks, activeSessions);
      const pendingApprovalCount = approvals.filter((a) => a.status === "pending").length;
      const failedTaskCount = tasks.filter((t) => t.status === "failed" || t.status === "timed_out").length;

      this.snapshot = {
        gatewayId: this.gatewayId,
        connectionState: this.connectionState,
        health: health
          ? {
              ok: Boolean(health.ok ?? true),
              uptimeMs: typeof health.uptimeMs === "number" ? health.uptimeMs : undefined,
              version: typeof health.version === "string" ? health.version : undefined,
              raw: redactValue(health) as Record<string, unknown>,
            }
          : null,
        agents,
        sessions,
        tasks,
        cronJobs,
        approvals,
        nodes,
        activeRunCount,
        pendingApprovalCount,
        failedTaskCount,
        updatedAt: new Date().toISOString(),
      };

      await this.syncSessionMessageSubscriptions(sessions);
      this.store.saveSnapshot(this.snapshot);
      this.publishSnapshot();
      return this.snapshot;
    } catch {
      this.snapshot = {
        ...this.snapshot,
        connectionState: this.connectionState,
        updatedAt: new Date().toISOString(),
      };
      this.publishSnapshot();
      return this.snapshot;
    } finally {
      this.refreshInFlight = false;
      if (this.refreshQueued) {
        this.refreshQueued = false;
        void this.refreshSnapshot();
      }
    }
  }

  private handleGatewayEvent(name: string, payload: unknown): void {
    const p = (payload ?? {}) as Record<string, unknown>;
    const kind = mapEventKind(name, p);
    if (!kind) return;

    const title = buildEventTitle(name, p);
    const summary = buildEventSummary(name, p);

    this.recordTimeline(kind, title, summary, undefined, {
      agentId: pickString(p, "agentId"),
      sessionKey: pickString(p, "sessionKey", "key"),
      runId: pickString(p, "runId"),
      taskId: pickString(p, "taskId"),
      payload: redactValue(p) as Record<string, unknown>,
    });

    const liveChanged = this.updateLiveSessionFromEvent(name, p);
    if (liveChanged) {
      this.publishLiveSnapshot();
    }

    if (
      name === "chat" ||
      name === "agent" ||
      name === "session.tool" ||
      name === "session.operation" ||
      name === "session.message" ||
      name === "sessions.changed" ||
      name === "cron" ||
      name === "exec.approval.requested" ||
      name === "exec.approval.resolved"
    ) {
      this.scheduleRefreshSnapshot();
    }
  }

  private recordTimeline(
    kind: TimelineEventKind,
    title: string,
    summary?: string,
    severity?: "info" | "warn" | "error",
    extra?: {
      agentId?: string;
      sessionKey?: string;
      runId?: string;
      taskId?: string;
      payload?: Record<string, unknown>;
    },
  ): void {
    if (this.stopped) return;
    try {
      const event = this.store.appendTimeline({
        kind,
        timestamp: new Date().toISOString(),
        title,
        summary,
        severity,
        agentId: extra?.agentId,
        sessionKey: extra?.sessionKey,
        runId: extra?.runId,
        taskId: extra?.taskId,
        payload: extra?.payload,
      });
      this.onTimeline?.(event);
    } catch {
      /* store may be closed during shutdown */
    }
  }

  private publishSnapshot(): void {
    this.onSnapshot?.(this.snapshot);
  }

  private publishLiveSnapshot(): void {
    const sessions = this.applyLiveSessions(this.snapshot.sessions);
    const runningTasks = this.snapshot.tasks.filter((t) => t.status === "running").length;
    const activeSessions = sessions.filter((s) => s.isActive).length;
    this.snapshot = {
      ...this.snapshot,
      sessions,
      activeRunCount: Math.max(runningTasks, activeSessions),
      updatedAt: new Date().toISOString(),
    };
    this.publishSnapshot();
  }

  private updateLiveSessionFromEvent(name: string, payload: Record<string, unknown>): boolean {
    return updateLiveSessionFromEvent(this.liveSessions, name, payload);
  }

  private applyLiveSessions(sessions: SessionSummary[]): SessionSummary[] {
    return applyLiveSessions(this.liveSessions, sessions);
  }
}

function emptySnapshot(gatewayId: string): RuntimeSnapshot {
  return {
    gatewayId,
    connectionState: "disconnected",
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
    updatedAt: new Date().toISOString(),
  };
}

function rankTask(task: TaskSummary): number {
  if (task.status === "running") return 100;
  if (task.status === "queued") return 90;
  if (task.status === "failed" || task.status === "timed_out") return 80;
  return 0;
}

function isRecentSession(updatedAt?: string): boolean {
  if (!updatedAt) return false;
  const ms = Date.parse(updatedAt);
  if (Number.isNaN(ms)) {
    const n = Number(updatedAt);
    if (!Number.isFinite(n)) return false;
    return Date.now() - n < 15 * 60_000;
  }
  return Date.now() - ms < 15 * 60_000;
}

function normalizeAgent(raw: unknown): AgentSummary {
  const a = raw as Record<string, unknown>;
  return {
    id: String(a.id ?? a.agentId ?? "unknown"),
    name: pickString(a, "name", "label"),
    model: pickString(a, "model"),
    runtime: pickString(a, "runtime", "agentRuntime"),
    workspace: pickString(a, "workspace"),
  };
}

function normalizeSession(raw: unknown): SessionSummary {
  const s = raw as Record<string, unknown>;
  const key = String(s.key ?? s.sessionKey ?? "unknown");
  const agentId = pickString(s, "agentId") ?? parseAgentIdFromKey(key);
  const subagentRunState = pickString(s, "subagentRunState");
  const status = pickString(s, "status");
  const processing = Boolean(s.processing);
  const hasActiveRun = Boolean(s.hasActiveRun);
  const isActive =
    hasActiveRun ||
    status === "running" ||
    status === "queued" ||
    processing ||
    subagentRunState === "running" ||
    subagentRunState === "active" ||
    Boolean(s.isActive);

  return {
    key,
    agentId,
    label: pickString(s, "label", "displayName", "name"),
    model: pickString(s, "model"),
    agentRuntime: pickString(s, "agentRuntime"),
    updatedAt: normalizeTimestamp(pickString(s, "updatedAt", "lastInteractionAt")),
    lastInteractionAt: normalizeTimestamp(pickString(s, "lastInteractionAt")),
    status,
    isActive,
    currentRunId: pickString(s, "runId", "currentRunId"),
    currentTool: pickString(s, "currentTool"),
  };
}

function normalizeTask(raw: unknown): TaskSummary {
  const t = raw as Record<string, unknown>;
  return {
    id: String(t.id ?? t.taskId ?? randomUUID()),
    status: (t.status as TaskSummary["status"]) ?? "queued",
    kind: pickString(t, "kind"),
    title: pickString(t, "title"),
    agentId: pickString(t, "agentId"),
    sessionKey: pickString(t, "sessionKey"),
    runId: pickString(t, "runId"),
    startedAt: normalizeTimestamp(pickString(t, "startedAt")),
    endedAt: normalizeTimestamp(pickString(t, "endedAt")),
    error: pickString(t, "error"),
  };
}

function normalizeCron(raw: unknown): CronJobSummary {
  const c = raw as Record<string, unknown>;
  return {
    id: String(c.id ?? c.jobId ?? randomUUID()),
    name: pickString(c, "name", "label"),
    enabled: Boolean(c.enabled ?? true),
    schedule: pickString(c, "schedule", "cron"),
    nextRunAt: normalizeTimestamp(pickString(c, "nextRunAt")),
    lastRunAt: normalizeTimestamp(pickString(c, "lastRunAt")),
    lastStatus: pickString(c, "lastStatus", "status"),
  };
}

function normalizeApproval(raw: unknown): ApprovalSummary {
  const a = raw as Record<string, unknown>;
  return {
    id: String(a.id ?? a.approvalId ?? randomUUID()),
    kind: a.kind === "plugin" ? "plugin" : "exec",
    status: (a.status as ApprovalSummary["status"]) ?? "pending",
    command: pickString(a, "command", "cmd"),
    sessionKey: pickString(a, "sessionKey"),
    agentId: pickString(a, "agentId"),
    requestedAt: normalizeTimestamp(pickString(a, "requestedAt", "createdAt")),
  };
}

function normalizeNode(raw: unknown): NodeSummary {
  const n = raw as Record<string, unknown>;
  return {
    id: String(n.id ?? n.nodeId ?? randomUUID()),
    label: pickString(n, "label", "name"),
    connected: Boolean(n.connected ?? n.online ?? false),
    platform: pickString(n, "platform"),
  };
}

function parseAgentIdFromKey(key: string): string | undefined {
  const match = /^agent:([^:]+):/.exec(key);
  return match?.[1];
}

function normalizeTimestamp(value?: string): string | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n > 1_000_000_000_000) {
    return new Date(n).toISOString();
  }
  return value;
}

function mapEventKind(name: string, p: Record<string, unknown>): TimelineEventKind | null {
  switch (name) {
    case "agent": {
      const stream = pickString(p, "stream");
      if (stream === "tool") return "agent.tool";
      if (stream === "assistant") return "agent.assistant";
      if (stream === "lifecycle") return "agent.lifecycle";
      return "agent.lifecycle";
    }
    case "chat":
      return "chat";
    case "session.message":
      return "session.message";
    case "session.operation":
      return "session.operation";
    case "session.tool":
      return "session.tool";
    case "sessions.changed":
      return "sessions.changed";
    case "cron":
      return "cron";
    case "health":
      return "health";
    case "presence":
      return "presence";
    case "heartbeat":
      return "heartbeat";
    case "exec.approval.requested":
      return "approval.requested";
    case "exec.approval.resolved":
    case "plugin.approval.resolved":
      return "approval.resolved";
    case "shutdown":
      return "gateway.shutdown";
    default:
      return null;
  }
}

function buildEventTitle(name: string, p: Record<string, unknown>): string {
  if (name === "session.message") {
    const status = pickString(p, "status");
    if (status === "running") return "Session running";
    if (status === "done") return "Session completed";
    if (status === "failed") return "Session failed";
    if (status === "timeout") return "Session timed out";
    return status ? `Session ${status}` : "Session update";
  }
  if (name === "chat") {
    const state = pickString(p, "state") ?? "update";
    if (state === "delta") return "Chat streaming";
    if (state === "final") return "Chat completed";
    if (state === "started") return "Chat started";
    return `Chat ${state}`;
  }
  if (name === "agent") {
    const stream = pickString(p, "stream") ?? "event";
    if (stream === "tool") return `Tool: ${pickString(p, "toolName", "name") ?? "unknown"}`;
    if (stream === "lifecycle") return `Agent ${pickString(p, "phase") ?? "lifecycle"}`;
    if (stream === "assistant") return "Assistant stream";
    return "Agent stream";
  }
  if (name === "session.tool") return `Session tool: ${pickString(p, "toolName", "name") ?? "unknown"}`;
  if (name === "session.operation") return `Session op: ${pickString(p, "phase", "operation") ?? "update"}`;
  if (name === "exec.approval.requested") return "Exec approval requested";
  if (name === "cron") return "Cron event";
  return name;
}

function buildEventSummary(name: string, p: Record<string, unknown>): string | undefined {
  if (name === "chat") {
    const delta = pickString(p, "deltaText");
    if (delta) return delta.slice(0, 120);
    const state = pickString(p, "state");
    return state ?? undefined;
  }
  if (name === "agent" && pickString(p, "stream") === "tool") {
    return pickString(p, "phase") ?? undefined;
  }
  return pickString(p, "summary", "message", "status") ?? undefined;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

interface LiveSessionActivity {
  agentId?: string;
  status: "running" | "done" | "failed" | "timeout";
  updatedAt: number;
  label?: string;
  currentTool?: string;
}

function resolveSessionKey(payload: Record<string, unknown>): string | undefined {
  const direct = pickString(payload, "sessionKey", "key");
  if (direct) return direct;
  const session = payload.session;
  if (session && typeof session === "object") {
    return pickString(session as Record<string, unknown>, "key", "sessionKey");
  }
  return undefined;
}

function extractToolName(payload: Record<string, unknown>): string | undefined {
  const message = payload.message;
  if (!message || typeof message !== "object") return undefined;
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return undefined;
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const block = item as Record<string, unknown>;
    if (block.type === "toolCall" && typeof block.name === "string") return block.name;
  }
  return undefined;
}

function updateLiveSessionFromEvent(
  liveSessions: Map<string, LiveSessionActivity>,
  name: string,
  payload: Record<string, unknown>,
): boolean {
  const sessionKey = resolveSessionKey(payload);
  if (!sessionKey) return false;

  const agentId = pickString(payload, "agentId") ?? parseAgentIdFromKey(sessionKey);
  const now = Date.now();

  if (name === "session.message") {
    const status = pickString(payload, "status");
    if (status === "running") {
      liveSessions.set(sessionKey, {
        agentId,
        status: "running",
        updatedAt: now,
        label: pickString(payload, "displayName"),
        currentTool: extractToolName(payload),
      });
      return true;
    }
    if (status === "done" || status === "failed" || status === "timeout") {
      return liveSessions.delete(sessionKey);
    }
    return false;
  }

  if (name === "chat") {
    const state = pickString(payload, "state");
    if (state === "started" || state === "delta") {
      liveSessions.set(sessionKey, {
        agentId,
        status: "running",
        updatedAt: now,
        label: pickString(payload, "displayName"),
      });
      return true;
    }
    if (state === "final" || state === "error") {
      return liveSessions.delete(sessionKey);
    }
    return false;
  }

  if (name === "agent") {
    const stream = pickString(payload, "stream");
    const phase = pickString(payload, "phase");
    if (stream === "tool" || (stream === "lifecycle" && phase !== "end" && phase !== "done")) {
      liveSessions.set(sessionKey, {
        agentId,
        status: "running",
        updatedAt: now,
        currentTool: stream === "tool" ? pickString(payload, "toolName", "name") : undefined,
      });
      return true;
    }
    if (stream === "lifecycle" && (phase === "end" || phase === "done")) {
      return liveSessions.delete(sessionKey);
    }
    return false;
  }

  if (name === "session.tool" || name === "session.operation") {
    liveSessions.set(sessionKey, {
      agentId,
      status: "running",
      updatedAt: now,
      currentTool: pickString(payload, "toolName", "name"),
    });
    return true;
  }

  return false;
}

function applyLiveSessions(
  liveSessions: Map<string, LiveSessionActivity>,
  sessions: SessionSummary[],
): SessionSummary[] {
  const now = Date.now();
  for (const [key, live] of liveSessions) {
    if (now - live.updatedAt > 15 * 60_000) liveSessions.delete(key);
  }

  const byKey = new Map(sessions.map((session) => [session.key, session]));
  for (const [key, live] of liveSessions) {
    if (live.status !== "running") continue;
    const existing = byKey.get(key);
    byKey.set(key, {
      ...(existing ?? { key }),
      key,
      agentId: existing?.agentId ?? live.agentId,
      label: existing?.label ?? live.label,
      isActive: true,
      currentTool: live.currentTool ?? existing?.currentTool,
      updatedAt: new Date(live.updatedAt).toISOString(),
    });
  }
  return [...byKey.values()];
}

export const gatewayBridgeTestUtils = {
  normalizeSession,
  createLiveSessionTracker: () => {
    const liveSessions = new Map<string, LiveSessionActivity>();
    return {
      update: (name: string, payload: Record<string, unknown>) =>
        updateLiveSessionFromEvent(liveSessions, name, payload),
      apply: (sessions: SessionSummary[]) => applyLiveSessions(liveSessions, sessions),
    };
  },
};
