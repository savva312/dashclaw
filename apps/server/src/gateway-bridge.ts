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
  SessionDiscoveryStatus,
  SessionSummary,
  CompactionCheckpointSummary,
  ContextBudgetSummary,
  DeliveryContextSummary,
  SessionOriginSummary,
  TaskRuntimeSummary,
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
  private assistantStreams = new AssistantStreamAccumulator();
  private sessionDiscovery = new SessionDiscoveryState();
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
      this.assistantStreams.clear();
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
    this.assistantStreams.clear();
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
      const [health, agentsRes, sessionDiscoveryResult, tasksRes, runningTasksRes, cronRes, nodesRes, approvalsRes] =
        await Promise.all([
          this.client.call<Record<string, unknown>>("health").catch(() => null),
          this.client.call<{ agents?: unknown[] }>("agents.list").catch(() => ({ agents: [] })),
          fetchSessionPages((params) => this.client.call("sessions.list", params)),
          this.client.call<{ tasks?: unknown[] }>("tasks.list", { limit: 100 }).catch(() => ({ tasks: [] })),
          this.client
            .call<{ tasks?: unknown[] }>("tasks.list", { limit: 50, status: ["running", "queued"] })
            .catch(() => ({ tasks: [] })),
          this.client.call<{ jobs?: unknown[] }>("cron.list").catch(() => ({ jobs: [] })),
          this.client.call<{ nodes?: unknown[] }>("node.list").catch(() => ({ nodes: [] })),
          this.client.call<{ approvals?: unknown[] }>("exec.approval.list").catch(() => ({ approvals: [] })),
        ]);

      const agents = (agentsRes.agents ?? []).map(normalizeAgent);
      const selectedSessions = this.sessionDiscovery.select(sessionDiscoveryResult);
      const sessions = this.applyLiveSessions(selectedSessions.sessions);
      const sessionDiscoveryStatus: SessionDiscoveryStatus = {
        ...sessionDiscoveryResult.status,
        publishedSessions: sessions.length,
        retainedLastComplete: selectedSessions.retainedLastComplete || undefined,
      };
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
              degraded: health.degraded === true,
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
        discovery: { sessions: sessionDiscoveryStatus },
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
    const p = normalizeGatewayEventPayload(name, payload);
    const kind = mapEventKind(name, p);
    if (!kind) return;

    const assistant = this.assistantStreams.consume(name, p);
    if (assistant) {
      this.recordAssistantTimeline(assistant);
    } else if (!isAssistantTransportEvent(name, p)) {
      for (const completed of this.assistantStreams.finalizeBoundary(name, p)) {
        this.recordAssistantTimeline(completed);
      }
      const title = buildEventTitle(name, p);
      const summary = buildEventSummary(name, p);

      this.recordTimeline(kind, title, summary, undefined, {
        agentId: pickNestedString(p, "agentId"),
        sessionKey: resolveSessionKey(p),
        runId: pickNestedString(p, "runId"),
        taskId: pickNestedString(p, "taskId"),
        payload: redactValue(p) as Record<string, unknown>,
      });
    }

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

  private recordAssistantTimeline(update: AssistantStreamUpdate): void {
    if (this.stopped) return;
    try {
      const event = this.store.upsertTimeline({
        id: update.timelineId,
        kind: update.kind,
        timestamp: update.timestamp,
        title: assistantTimelineTitle(update),
        summary: redactValue(update.text, MAX_ASSISTANT_TEXT) as string,
        severity: update.terminalState === "error" ? "error" : update.terminalState === "aborted" ? "warn" : undefined,
        agentId: update.agentId,
        sessionKey: update.sessionKey,
        runId: update.runId,
        taskId: update.taskId,
        payload: redactValue({
          responseId: update.responseId,
          streaming: !update.terminal,
          state: update.terminalState ?? "delta",
          sequence: update.sequence,
          sequenceDiagnostic: update.sequenceDiagnostic,
          replace: update.replace,
          usage: update.usage,
          stopReason: update.stopReason,
          errorKind: update.errorKind,
          errorMessage: update.errorMessage,
          spawnedBy: update.spawnedBy,
        }) as Record<string, unknown>,
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

const DEFAULT_SESSION_PAGE_LIMIT = 100;
const DEFAULT_MAX_SESSION_PAGES = 25;
const DEFAULT_MAX_SESSION_ROWS = 2_500;

interface SessionsListPage {
  sessions?: unknown[];
  hasMore?: boolean;
  nextOffset?: number;
  total?: number;
}

interface SessionPageOptions {
  pageLimit?: number;
  maxPages?: number;
  maxRows?: number;
}

interface SessionPageResult {
  sessions: SessionSummary[];
  status: Omit<SessionDiscoveryStatus, "publishedSessions" | "retainedLastComplete">;
}

type SessionsListCall = (params: { limit: number; offset: number }) => Promise<SessionsListPage>;

async function fetchSessionPages(
  call: SessionsListCall,
  options: SessionPageOptions = {},
): Promise<SessionPageResult> {
  const pageLimit = positiveInteger(options.pageLimit, DEFAULT_SESSION_PAGE_LIMIT);
  const maxPages = positiveInteger(options.maxPages, DEFAULT_MAX_SESSION_PAGES);
  const maxRows = positiveInteger(options.maxRows, DEFAULT_MAX_SESSION_ROWS);
  const sessionsByKey = new Map<string, SessionSummary>();
  const sessionOrder: string[] = [];
  const visitedOffsets = new Set<number>();
  let offset = 0;
  let pagesFetched = 0;
  let rowsFetched = 0;
  let expectedTotal: number | undefined;

  const result = (
    state: "complete" | "incomplete",
    details: Pick<SessionDiscoveryStatus, "reason" | "nextOffset" | "message"> = {},
  ): SessionPageResult => ({
    sessions: sessionOrder.map((key) => sessionsByKey.get(key)!),
    status: {
      state,
      degraded: state === "incomplete",
      pagesFetched,
      rowsFetched,
      uniqueSessionsFetched: sessionOrder.length,
      expectedTotal,
      ...details,
    },
  });

  while (true) {
    visitedOffsets.add(offset);
    let page: SessionsListPage;
    try {
      page = await call({ limit: pageLimit, offset });
    } catch {
      return result("incomplete", {
        reason: "page-error",
        nextOffset: offset,
        message: `sessions.list failed on page ${pagesFetched + 1}; the snapshot may omit sessions`,
      });
    }

    pagesFetched += 1;
    if (Number.isSafeInteger(page.total) && (page.total ?? -1) >= 0) {
      expectedTotal = page.total;
    }

    const rows = Array.isArray(page.sessions) ? page.sessions : [];
    const remaining = maxRows - rowsFetched;
    const acceptedRows = rows.slice(0, Math.max(0, remaining));
    for (const raw of acceptedRows) {
      const session = normalizeSession(raw);
      if (!sessionsByKey.has(session.key)) sessionOrder.push(session.key);
      // Preserve first-seen order while allowing a later duplicate to provide
      // the value published for that key.
      sessionsByKey.set(session.key, session);
    }
    rowsFetched += acceptedRows.length;

    if (acceptedRows.length < rows.length || (rowsFetched >= maxRows && page.hasMore === true)) {
      return result("incomplete", {
        reason: "row-cap",
        nextOffset: validOffset(page.nextOffset) ? page.nextOffset : undefined,
        message: `session discovery stopped at the ${maxRows}-row safety cap`,
      });
    }

    if (page.hasMore !== true) {
      if (expectedTotal !== undefined && rowsFetched < expectedTotal) {
        return result("incomplete", {
          reason: "inconsistent-page",
          message: `sessions.list ended after ${rowsFetched} rows but reported ${expectedTotal} total`,
        });
      }
      return result("complete");
    }

    if (pagesFetched >= maxPages) {
      return result("incomplete", {
        reason: "page-cap",
        nextOffset: validOffset(page.nextOffset) ? page.nextOffset : undefined,
        message: `session discovery stopped at the ${maxPages}-page safety cap`,
      });
    }

    const nextOffset = page.nextOffset;
    if (!validOffset(nextOffset) || nextOffset <= offset || visitedOffsets.has(nextOffset)) {
      return result("incomplete", {
        reason: "invalid-next-offset",
        nextOffset: validOffset(nextOffset) ? nextOffset : undefined,
        message: "sessions.list reported more rows without a new forward offset",
      });
    }
    offset = nextOffset;
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}

function validOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

class SessionDiscoveryState {
  private lastComplete: SessionSummary[] | null = null;

  select(result: SessionPageResult): { sessions: SessionSummary[]; retainedLastComplete: boolean } {
    if (result.status.state === "complete") {
      this.lastComplete = result.sessions;
      return { sessions: result.sessions, retainedLastComplete: false };
    }
    if (this.lastComplete) {
      return { sessions: this.lastComplete, retainedLastComplete: true };
    }
    return { sessions: result.sessions, retainedLastComplete: false };
  }
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
  const a = asRecord(raw);
  const runtime = normalizeRuntimeIdentity(a.runtime ?? a.agentRuntime);
  return {
    id: String(a.id ?? a.agentId ?? "unknown"),
    name: pickString(a, "name", "label"),
    model: normalizeModel(a.model),
    runtime: runtime.id,
    runtimeSource: runtime.source,
    thinkingDefault: pickString(a, "thinkingDefault"),
    workspace: pickString(a, "workspace"),
  };
}

function normalizeSession(raw: unknown): SessionSummary {
  const s = asRecord(raw);
  const key = String(s.key ?? s.sessionKey ?? "unknown");
  const agentId = pickString(s, "agentId") ?? parseAgentIdFromKey(key);
  const subagentRunState = pickString(s, "subagentRunState");
  const status = pickString(s, "status");
  const processing = pickBoolean(s, "processing") ?? false;
  const hasActiveRun = pickBoolean(s, "hasActiveRun") ?? false;
  const agentRuntime = normalizeRuntimeIdentity(s.agentRuntime);
  const isActive =
    hasActiveRun ||
    status === "running" ||
    status === "queued" ||
    processing ||
    subagentRunState === "running" ||
    subagentRunState === "active" ||
    (pickBoolean(s, "isActive") ?? false);
  const rawWorktree =
    s.worktree && typeof s.worktree === "object" && !Array.isArray(s.worktree)
      ? (s.worktree as Record<string, unknown>)
      : undefined;
  const worktree = rawWorktree
    ? {
        id: pickString(rawWorktree, "id"),
        path: pickString(rawWorktree, "path"),
        branch: pickString(rawWorktree, "branch"),
        repoRoot: pickString(rawWorktree, "repoRoot"),
      }
    : undefined;

  return {
    key,
    sessionId: pickString(s, "sessionId"),
    kind: pickString(s, "kind"),
    agentId,
    parentSessionKey: pickString(s, "parentSessionKey"),
    spawnedBy: pickString(s, "spawnedBy"),
    ownerSessionKey: pickString(s, "ownerSessionKey"),
    spawnDepth: pickNumber(s, "spawnDepth"),
    subagentRole: pickString(s, "subagentRole"),
    subagentControlScope: pickString(s, "subagentControlScope"),
    forkedFromParent: pickBoolean(s, "forkedFromParent"),
    label: pickString(s, "label", "displayName", "name"),
    model: normalizeModel(s.model),
    modelProvider: pickString(s, "modelProvider"),
    agentRuntime: agentRuntime.id,
    agentRuntimeSource: agentRuntime.source,
    startedAt: normalizeTimestamp(s.startedAt),
    endedAt: normalizeTimestamp(s.endedAt),
    runtimeMs: pickNumber(s, "runtimeMs"),
    updatedAt: normalizeTimestamp(s.updatedAt ?? s.lastInteractionAt),
    lastInteractionAt: normalizeTimestamp(s.lastInteractionAt),
    status,
    isActive,
    hasActiveRun: pickBoolean(s, "hasActiveRun"),
    hasActiveSubagentRun: pickBoolean(s, "hasActiveSubagentRun"),
    subagentRunState,
    abortedLastRun: pickBoolean(s, "abortedLastRun"),
    currentRunId: pickString(s, "runId", "currentRunId"),
    currentTool: pickString(s, "currentTool"),
    inputTokens: pickNumber(s, "inputTokens"),
    outputTokens: pickNumber(s, "outputTokens"),
    totalTokens: pickNumber(s, "totalTokens"),
    contextTokens: pickNumber(s, "contextTokens"),
    estimatedCostUsd: pickNumber(s, "estimatedCostUsd"),
    contextBudgetStatus: normalizeContextBudget(s.contextBudgetStatus),
    compactionCheckpoint: normalizeCompactionCheckpoint(s.compactionCheckpoint),
    deliveryContext: normalizeDeliveryContext(s.deliveryContext),
    origin: normalizeSessionOrigin(s.origin),
    spawnedWorkspaceDir: pickString(s, "spawnedWorkspaceDir"),
    spawnedCwd: pickString(s, "spawnedCwd"),
    worktree,
  };
}

function normalizeTask(raw: unknown): TaskSummary {
  const t = asRecord(raw);
  const error = normalizeError(t.error);
  return {
    id: String(t.id ?? t.taskId ?? randomUUID()),
    status: (t.status as TaskSummary["status"]) ?? "queued",
    kind: pickString(t, "kind"),
    title: pickString(t, "title"),
    agentId: pickString(t, "agentId"),
    sessionKey: pickString(t, "sessionKey"),
    runId: pickString(t, "runId"),
    ownerKey: pickString(t, "ownerKey"),
    childSessionKey: pickString(t, "childSessionKey"),
    sourceId: pickString(t, "sourceId"),
    flowId: pickString(t, "flowId"),
    createdAt: normalizeTimestamp(t.createdAt),
    updatedAt: normalizeTimestamp(t.updatedAt),
    startedAt: normalizeTimestamp(t.startedAt),
    endedAt: normalizeTimestamp(t.endedAt),
    runtime: normalizeTaskRuntime(t.runtime),
    progressSummary: pickString(t, "progressSummary"),
    terminalSummary: pickString(t, "terminalSummary"),
    error: error.message,
    errorCode: error.code,
    errorKind: error.kind,
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

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  if (typeof value === "string" && value.trim().length === 0) return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric) && numeric >= 1_000_000_000_000) {
    const date = new Date(numeric);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeModel(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  return pickString(asRecord(value), "primary", "id", "name");
}

function normalizeRuntimeIdentity(value: unknown): { id?: string; source?: string } {
  if (typeof value === "string" && value.length > 0) return { id: value };
  const runtime = asRecord(value);
  return { id: pickString(runtime, "id", "runtime"), source: pickString(runtime, "source") };
}

function normalizeContextBudget(value: unknown): ContextBudgetSummary | undefined {
  if (typeof value === "string" && value.length > 0) return { status: value };
  const budget = asRecord(value);
  if (Object.keys(budget).length === 0) return undefined;
  const result: ContextBudgetSummary = {
    status: pickString(budget, "status", "level"),
    reason: pickString(budget, "reason"),
    budgetTokens: pickNumber(budget, "budgetTokens", "limitTokens"),
    remainingTokens: pickNumber(budget, "remainingTokens"),
    usedPercent: pickNumber(budget, "usedPercent", "percentUsed"),
  };
  return hasDefinedValue(result) ? result : undefined;
}

function normalizeCompactionCheckpoint(value: unknown): CompactionCheckpointSummary | undefined {
  const checkpoint = asRecord(value);
  if (Object.keys(checkpoint).length === 0) return undefined;
  const result: CompactionCheckpointSummary = {
    timestamp: normalizeTimestamp(checkpoint.timestamp ?? checkpoint.at ?? checkpoint.createdAt),
    reason: pickString(checkpoint, "reason"),
    tokensBefore: pickNumber(checkpoint, "tokensBefore"),
    tokensAfter: pickNumber(checkpoint, "tokensAfter"),
  };
  return hasDefinedValue(result) ? result : undefined;
}

function normalizeDeliveryContext(value: unknown): DeliveryContextSummary | undefined {
  const context = asRecord(value);
  if (Object.keys(context).length === 0) return undefined;
  const result: DeliveryContextSummary = {
    channel: pickString(context, "channel"),
    to: pickString(context, "to"),
    accountId: pickString(context, "accountId"),
    threadId: pickString(context, "threadId"),
  };
  return hasDefinedValue(result) ? result : undefined;
}

function normalizeSessionOrigin(value: unknown): SessionOriginSummary | undefined {
  const origin = asRecord(value);
  if (Object.keys(origin).length === 0) return undefined;
  const result: SessionOriginSummary = {
    provider: pickString(origin, "provider"),
    surface: pickString(origin, "surface"),
    chatType: pickString(origin, "chatType"),
    accountId: pickString(origin, "accountId"),
    channelId: pickString(origin, "channelId"),
    threadId: pickString(origin, "threadId"),
  };
  return hasDefinedValue(result) ? result : undefined;
}

function normalizeTaskRuntime(value: unknown): TaskRuntimeSummary | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return { runtimeMs: value };
  if (typeof value === "string" && value.length > 0) return { id: value };
  const runtime = asRecord(value);
  if (Object.keys(runtime).length === 0) return undefined;
  const result: TaskRuntimeSummary = {
    id: pickString(runtime, "id"),
    source: pickString(runtime, "source"),
    startedAt: normalizeTimestamp(runtime.startedAt),
    endedAt: normalizeTimestamp(runtime.endedAt),
    runtimeMs: pickNumber(runtime, "runtimeMs", "durationMs"),
  };
  return hasDefinedValue(result) ? result : undefined;
}

function normalizeError(value: unknown): { message?: string; code?: string; kind?: string } {
  if (typeof value === "string" && value.length > 0) return { message: value };
  const error = asRecord(value);
  return {
    message: pickString(error, "message", "summary"),
    code: pickString(error, "code"),
    kind: pickString(error, "kind", "name"),
  };
}

function hasDefinedValue(value: object): boolean {
  return Object.values(value).some((entry) => entry !== undefined);
}

/**
 * OpenClaw's `agent` event is an envelope: routing fields live at the top level
 * while stream-specific fields live in `data`. Consumers should not have to
 * know which half of the envelope owns a field. Keep the original `data`
 * object for inspection, but expose its fields through one normalized view.
 */
function normalizeGatewayEventPayload(name: string, payload: unknown): Record<string, unknown> {
  const envelope = isRecord(payload) ? payload : {};
  if (name !== "agent" || !isRecord(envelope.data)) return envelope;
  return {
    ...envelope.data,
    ...envelope,
    data: envelope.data,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
    if (state === "aborted") return "Chat aborted";
    if (state === "error") return "Chat failed";
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

function assistantTimelineTitle(update: AssistantStreamUpdate): string {
  if (!update.terminal) return "Assistant responding";
  if (update.terminalState === "aborted") return "Assistant response aborted";
  if (update.terminalState === "error") return "Assistant response failed";
  return "Assistant response";
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function pickBoolean(obj: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

const MAX_ASSISTANT_TEXT = 50_000;
const MAX_ASSISTANT_STREAMS = 100;

interface AssistantStreamState {
  timelineId: string;
  timestamp: string;
  text: string;
  sessionKey: string;
  runId?: string;
  responseId?: string;
  agentId?: string;
  taskId?: string;
  spawnedBy?: string;
  kind: "chat" | "agent.assistant";
  sequence?: number;
}

interface AssistantStreamUpdate extends AssistantStreamState {
  terminal: boolean;
  terminalState?: string;
  sequenceDiagnostic?: "gap" | "regression" | "duplicate";
  replace?: boolean;
  usage?: unknown;
  stopReason?: string;
  errorKind?: string;
  errorMessage?: string;
}

class AssistantStreamAccumulator {
  private streams = new Map<string, AssistantStreamState>();
  private activeResponseByScope = new Map<string, string>();
  private terminalKeys = new Map<string, true>();

  consume(name: string, payload: Record<string, unknown>): AssistantStreamUpdate | null {
    const sessionKey = resolveSessionKey(payload);
    if (!sessionKey) return null;

    if (!isAssistantTransportEvent(name, payload)) return null;

    const runId = pickNestedString(payload, "runId");
    const responseId = pickNestedString(payload, "responseId", "messageId", "id");
    const scope = `${sessionKey}\u0000run:${runId ?? "current"}`;
    const key = responseId
      ? `${scope}\u0000response:${responseId}`
      : scope;
    const terminalState = terminalStateFor(name, payload);
    const terminal = terminalState !== undefined;
    const stableIdentity = Boolean(runId || responseId);
    if (this.terminalKeys.has(key)) {
      if (stableIdentity || terminal) return null;
      this.terminalKeys.delete(key);
    }
    if (responseId) {
      this.streams.delete(scope);
      this.activeResponseByScope.set(scope, key);
    }
    const chunk = extractAssistantText(payload);
    const existing = this.streams.get(key);
    const sequence = pickNestedNumber(payload, "seq", "sequence");
    const sequenceDiagnostic = compareSequence(existing?.sequence, sequence);
    const replace = pickNestedBoolean(payload, "replace") ?? false;

    if (!chunk && !existing && !terminal) return null;

    const state: AssistantStreamState = existing ?? {
      timelineId: randomUUID(),
      timestamp: eventTimestamp(payload),
      text: "",
      sessionKey,
      runId,
      responseId,
      agentId: pickNestedString(payload, "agentId"),
      taskId: pickNestedString(payload, "taskId"),
      spawnedBy: pickNestedString(payload, "spawnedBy"),
      kind: name === "chat" ? "chat" : "agent.assistant",
    };

    const authoritativeTerminalText = terminal && Boolean(pickString(payload, "text", "content"));
    if (chunk && (!sequenceDiagnostic || sequenceDiagnostic === "gap" || authoritativeTerminalText)) {
      state.text = (replace ? chunk : mergeAssistantText(state.text, chunk)).slice(0, MAX_ASSISTANT_TEXT);
    }
    if (sequence !== undefined && (state.sequence === undefined || sequence > state.sequence)) state.sequence = sequence;
    if (!state.text) {
      if (!terminal) return null;
      state.text = terminalFallbackText(terminalState, payload);
    }

    if (terminal) {
      this.deleteStream(key);
      if (this.activeResponseByScope.get(scope) === key) this.activeResponseByScope.delete(scope);
      this.rememberTerminal(key);
    } else {
      this.streams.set(key, state);
      this.evictOldest();
    }
    return {
      ...state,
      terminal,
      terminalState,
      sequence: sequence ?? state.sequence,
      sequenceDiagnostic,
      replace,
      usage: pickNestedValue(payload, "usage"),
      stopReason: pickNestedString(payload, "stopReason"),
      errorKind: pickNestedString(payload, "errorKind"),
      errorMessage: pickNestedString(payload, "errorMessage"),
    };
  }

  finalizeBoundary(name: string, payload: Record<string, unknown>): AssistantStreamUpdate[] {
    const sessionKey = resolveSessionKey(payload);
    if (!sessionKey || !isAssistantSessionTerminalBoundary(name, payload)) return [];

    const completed: AssistantStreamUpdate[] = [];
    for (const [key, state] of this.streams) {
      if (state.sessionKey !== sessionKey) continue;
      completed.push({ ...state, terminal: true, terminalState: terminalStateFor(name, payload) });
      this.deleteStream(key);
      this.rememberTerminal(key);
    }
    for (const scope of this.activeResponseByScope.keys()) {
      if (scope.startsWith(`${sessionKey}\u0000`)) this.activeResponseByScope.delete(scope);
    }
    return completed;
  }

  clear(): void {
    this.streams.clear();
    this.activeResponseByScope.clear();
    this.terminalKeys.clear();
  }

  stats(): { active: number; terminal: number } {
    return { active: this.streams.size, terminal: this.terminalKeys.size };
  }

  private evictOldest(): void {
    while (this.streams.size > MAX_ASSISTANT_STREAMS) {
      const oldest = this.streams.keys().next().value as string | undefined;
      if (!oldest) return;
      this.deleteStream(oldest);
    }
  }

  private deleteStream(key: string): void {
    this.streams.delete(key);
    for (const [scope, activeKey] of this.activeResponseByScope) {
      if (activeKey === key) this.activeResponseByScope.delete(scope);
    }
  }

  private rememberTerminal(key: string): void {
    this.terminalKeys.delete(key);
    this.terminalKeys.set(key, true);
    while (this.terminalKeys.size > MAX_ASSISTANT_STREAMS * 2) {
      const oldest = this.terminalKeys.keys().next().value as string | undefined;
      if (!oldest) return;
      this.terminalKeys.delete(oldest);
    }
  }
}

function isAssistantTransportEvent(name: string, payload: Record<string, unknown>): boolean {
  if (name === "agent") return pickString(payload, "stream") === "assistant";
  if (name !== "chat") return false;
  const role = pickNestedString(payload, "role");
  return role !== "user" && role !== "tool";
}

function extractAssistantText(payload: Record<string, unknown>): string | undefined {
  const direct = pickString(payload, "deltaText", "delta", "text", "content");
  if (direct) return direct;

  for (const key of ["message", "data", "chunk", "response"]) {
    const nested = payload[key];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    const text = extractAssistantText(nested as Record<string, unknown>);
    if (text) return text;
  }

  for (const key of ["content", "parts"]) {
    const blocks = payload[key];
    if (!Array.isArray(blocks)) continue;
    const text = blocks
      .filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === "object")
      .filter((block) => block.type === undefined || block.type === "text" || block.type === "output_text")
      .map((block) => pickString(block, "text", "content", "delta") ?? "")
      .join("");
    if (text) return text;
  }
  return undefined;
}

function pickNestedString(payload: Record<string, unknown>, ...keys: string[]): string | undefined {
  const direct = pickString(payload, ...keys);
  if (direct) return direct;
  for (const container of ["message", "data", "chunk", "response"]) {
    const nested = payload[container];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    const value = pickString(nested as Record<string, unknown>, ...keys);
    if (value) return value;
  }
  return undefined;
}

function pickNestedNumber(payload: Record<string, unknown>, ...keys: string[]): number | undefined {
  const value = pickNestedValue(payload, ...keys);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function pickNestedBoolean(payload: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  const value = pickNestedValue(payload, ...keys);
  return typeof value === "boolean" ? value : undefined;
}

function pickNestedValue(payload: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (payload[key] !== undefined) return payload[key];
  }
  for (const container of ["message", "data", "chunk", "response"]) {
    const nested = payload[container];
    if (!isRecord(nested)) continue;
    for (const key of keys) {
      if (nested[key] !== undefined) return nested[key];
    }
  }
  return undefined;
}

function compareSequence(
  previous: number | undefined,
  incoming: number | undefined,
): AssistantStreamUpdate["sequenceDiagnostic"] {
  if (previous === undefined || incoming === undefined) return undefined;
  if (incoming === previous) return "duplicate";
  if (incoming < previous) return "regression";
  if (incoming > previous + 1) return "gap";
  return undefined;
}

function terminalFallbackText(state: string | undefined, payload: Record<string, unknown>): string {
  const errorMessage = pickNestedString(payload, "errorMessage", "message");
  if (state === "error") return errorMessage ? `Response failed: ${errorMessage}` : "Response failed";
  if (state === "aborted") return "Response aborted";
  return "Response completed without text";
}

function eventTimestamp(payload: Record<string, unknown>): string {
  const value = pickNestedValue(payload, "ts", "timestamp");
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function mergeAssistantText(current: string, incoming: string): string {
  if (!current) return incoming;
  if (!incoming || current === incoming || current.endsWith(incoming)) return current;
  if (incoming.startsWith(current)) return incoming;

  const overlapLimit = Math.min(current.length, incoming.length);
  for (let overlap = overlapLimit; overlap > 0; overlap -= 1) {
    if (current.endsWith(incoming.slice(0, overlap))) {
      return current + incoming.slice(overlap);
    }
  }
  return current + incoming;
}

function isAssistantSessionTerminalBoundary(name: string, payload: Record<string, unknown>): boolean {
  if (name === "shutdown") return true;
  if (name === "session.message" || name === "sessions.changed") {
    return isTerminalBoundary(name, payload);
  }
  return name === "agent" && pickString(payload, "stream") === "lifecycle" && isTerminalBoundary(name, payload);
}

function isTerminalBoundary(name: string, payload: Record<string, unknown>): boolean {
  return terminalStateFor(name, payload) !== undefined;
}

function terminalStateFor(name: string, payload: Record<string, unknown>): string | undefined {
  const state = pickNestedString(payload, "state", "status", "phase", "event");
  if (!state) return name === "shutdown" ? "shutdown" : undefined;
  const normalized = state.toLowerCase();
  return new Set([
    "final",
    "done",
    "completed",
    "complete",
    "failed",
    "error",
    "timeout",
    "timed_out",
    "cancelled",
    "canceled",
    "aborted",
    "end",
    "ended",
    "stop",
    "stopped",
  ]).has(normalized)
    ? normalized
    : undefined;
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
    if (state === "final" || state === "error" || state === "aborted") {
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
  normalizeAgent,
  normalizeSession,
  normalizeTask,
  normalizeGatewayEventPayload,
  mapEventKind,
  buildEventTitle,
  mergeAssistantText,
  createAssistantStreamAccumulator: () => new AssistantStreamAccumulator(),
  fetchSessionPages,
  createSessionDiscoveryTracker: () => {
    const state = new SessionDiscoveryState();
    return { select: (result: SessionPageResult) => state.select(result) };
  },
  createLiveSessionTracker: () => {
    const liveSessions = new Map<string, LiveSessionActivity>();
    return {
      update: (name: string, payload: Record<string, unknown>) =>
        updateLiveSessionFromEvent(liveSessions, name, payload),
      apply: (sessions: SessionSummary[]) => applyLiveSessions(liveSessions, sessions),
    };
  },
};
