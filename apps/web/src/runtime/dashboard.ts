import type {
  AgentSummary,
  ApprovalSummary,
  RuntimeSnapshot,
  SessionSummary,
  TaskSummary,
  TimelineEvent,
} from "@dashclaw/runtime-model";

export type AttentionTone = "error" | "warn" | "info";
export type AttentionKind =
  | "gateway"
  | "health"
  | "stale-snapshot"
  | "task-failed"
  | "approval"
  | "long-running-task"
  | "stale-active-session";

export interface RuntimeLinks {
  agent?: string;
  session?: string;
  task?: string;
  timeline?: string;
  approval?: string;
}

export interface ActiveWorkItem {
  id: string;
  label: string;
  status: "running" | "queued" | "active-session";
  agent?: AgentSummary;
  session?: SessionSummary;
  task?: TaskSummary;
  runId?: string;
  currentTool?: string;
  startedAt?: string;
  updatedAt?: string;
  links: RuntimeLinks;
}

export interface AgentWorkSummary {
  agent: AgentSummary;
  activeWork: ActiveWorkItem[];
  sessions: SessionSummary[];
  activeSessions: SessionSummary[];
  pendingApprovals: ApprovalSummary[];
  failedTasks: TaskSummary[];
  lastActivityAt?: string;
  state: "working" | "attention" | "idle";
}

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  tone: AttentionTone;
  title: string;
  summary?: string;
  agent?: AgentSummary;
  session?: SessionSummary;
  task?: TaskSummary;
  approval?: ApprovalSummary;
  timestamp?: string;
  links: RuntimeLinks;
}

export interface DashboardModel {
  generatedAt: string;
  connectionState: RuntimeSnapshot["connectionState"];
  isLive: boolean;
  isStale: boolean;
  summary: {
    totalAgents: number;
    workingAgents: number;
    activeWork: number;
    pendingApprovals: number;
    failedTasks: number;
    attentionItems: number;
  };
  agents: AgentWorkSummary[];
  activeWork: ActiveWorkItem[];
  attention: AttentionItem[];
  recentEvents: TimelineEvent[];
}

export interface TaskDetailModel {
  task: TaskSummary;
  agent?: AgentSummary;
  session?: SessionSummary;
  events: TimelineEvent[];
  links: RuntimeLinks;
}

export interface DashboardModelOptions {
  nowMs?: number;
  snapshotStaleAfterMs?: number;
  activeSessionStaleAfterMs?: number;
  longRunningTaskAfterMs?: number;
  recentEventLimit?: number;
}

const DEFAULT_SNAPSHOT_STALE_AFTER_MS = 30_000;
const DEFAULT_ACTIVE_SESSION_STALE_AFTER_MS = 5 * 60_000;
const DEFAULT_LONG_RUNNING_TASK_AFTER_MS = 30 * 60_000;
const DEFAULT_RECENT_EVENT_LIMIT = 20;
const NOISE_EVENT_KINDS = new Set(["health", "presence", "heartbeat"]);

export function buildDashboardModel(
  snapshot: RuntimeSnapshot,
  timeline: TimelineEvent[],
  options: DashboardModelOptions = {},
): DashboardModel {
  const nowMs = options.nowMs ?? Date.now();
  const snapshotStaleAfterMs = options.snapshotStaleAfterMs ?? DEFAULT_SNAPSHOT_STALE_AFTER_MS;
  const activeSessionStaleAfterMs =
    options.activeSessionStaleAfterMs ?? DEFAULT_ACTIVE_SESSION_STALE_AFTER_MS;
  const longRunningTaskAfterMs = options.longRunningTaskAfterMs ?? DEFAULT_LONG_RUNNING_TASK_AFTER_MS;
  const recentEventLimit = options.recentEventLimit ?? DEFAULT_RECENT_EVENT_LIMIT;

  const agentsById = mapBy(snapshot.agents, (agent) => agent.id);
  const sessionsByKey = mapBy(snapshot.sessions, (session) => session.key);
  const pendingApprovals = snapshot.approvals.filter((approval) => approval.status === "pending");
  const failedTasks = snapshot.tasks.filter(
    (task) => task.status === "failed" || task.status === "timed_out",
  );
  const activeWork = buildActiveWork(snapshot, agentsById, sessionsByKey);
  const attention = buildAttentionItems(snapshot, {
    agentsById,
    sessionsByKey,
    pendingApprovals,
    failedTasks,
    nowMs,
    snapshotStaleAfterMs,
    activeSessionStaleAfterMs,
    longRunningTaskAfterMs,
  });
  const recentEvents = filterMeaningfulEvents(timeline)
    .sort(compareEventsDesc)
    .slice(0, recentEventLimit);
  const agents = buildAgentWorkSummaries(snapshot, {
    activeWork,
    agentsById,
    pendingApprovals,
    failedTasks,
  });
  const isStale = isOlderThan(snapshot.updatedAt, nowMs, snapshotStaleAfterMs);
  const workingAgents = agents.filter((agent) => agent.state === "working").length;

  return {
    generatedAt: new Date(nowMs).toISOString(),
    connectionState: snapshot.connectionState,
    isLive: snapshot.connectionState === "connected" && !isStale && snapshot.health?.degraded !== true,
    isStale,
    summary: {
      totalAgents: snapshot.agents.length,
      workingAgents,
      activeWork: activeWork.length,
      pendingApprovals: pendingApprovals.length,
      failedTasks: failedTasks.length,
      attentionItems: attention.length,
    },
    agents,
    activeWork,
    attention,
    recentEvents,
  };
}

export function buildTaskDetailModel(
  snapshot: RuntimeSnapshot,
  timeline: TimelineEvent[],
  taskId: string,
): TaskDetailModel | null {
  const task = snapshot.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return null;

  const agent = task.agentId ? snapshot.agents.find((candidate) => candidate.id === task.agentId) : undefined;
  const session = task.sessionKey
    ? snapshot.sessions.find((candidate) => candidate.key === task.sessionKey)
    : undefined;

  return {
    task,
    agent,
    session,
    events: relatedEventsForTask(timeline, task),
    links: linksFor({ agentId: task.agentId, sessionKey: task.sessionKey, taskId: task.id }),
  };
}

export function relatedEventsForTask(timeline: TimelineEvent[], task: TaskSummary): TimelineEvent[] {
  return filterMeaningfulEvents(timeline)
    .filter((event) => {
      if (event.taskId && event.taskId === task.id) return true;
      if (task.runId && event.runId === task.runId) return true;
      if (task.sessionKey && event.sessionKey === task.sessionKey) return true;
      if (task.agentId && event.agentId === task.agentId) return true;
      return false;
    })
    .sort(compareEventsDesc);
}

export function linksFor(input: {
  agentId?: string;
  sessionKey?: string;
  taskId?: string;
  approvalId?: string;
}): RuntimeLinks {
  return {
    agent: input.agentId ? `/agents/${encodeURIComponent(input.agentId)}` : undefined,
    session:
      input.agentId && input.sessionKey
        ? `/agents/${encodeURIComponent(input.agentId)}/sessions/${encodeURIComponent(input.sessionKey)}`
        : undefined,
    task: input.taskId ? `/tasks/${encodeURIComponent(input.taskId)}` : undefined,
    timeline: "/timeline",
    approval: input.approvalId ? "/approvals" : undefined,
  };
}

function buildActiveWork(
  snapshot: RuntimeSnapshot,
  agentsById: Map<string, AgentSummary>,
  sessionsByKey: Map<string, SessionSummary>,
): ActiveWorkItem[] {
  const taskWork: ActiveWorkItem[] = snapshot.tasks
    .filter((task) => task.status === "running" || task.status === "queued")
    .map((task) => {
      const session = task.sessionKey ? sessionsByKey.get(task.sessionKey) : undefined;
      const agentId = task.agentId ?? session?.agentId;
      const agent = agentId ? agentsById.get(agentId) : undefined;

      return {
        id: `task:${task.id}`,
        label: task.title ?? task.id,
        status: task.status === "running" ? "running" : "queued",
        agent,
        session,
        task,
        runId: task.runId ?? session?.currentRunId,
        currentTool: session?.currentTool,
        startedAt: task.startedAt,
        updatedAt: session?.updatedAt ?? session?.lastInteractionAt ?? task.startedAt,
        links: linksFor({ agentId, sessionKey: session?.key ?? task.sessionKey, taskId: task.id }),
      } satisfies ActiveWorkItem;
    });

  const taskSessionKeys = new Set(
    taskWork
      .map((item) => item.session?.key ?? item.task?.sessionKey)
      .filter((key): key is string => Boolean(key)),
  );
  const sessionOnlyWork: ActiveWorkItem[] = snapshot.sessions
    .filter((session) => session.isActive && !taskSessionKeys.has(session.key))
    .map((session) => {
      const agent = session.agentId ? agentsById.get(session.agentId) : undefined;

      return {
        id: `session:${session.key}`,
        label: session.label ?? shortSessionKey(session.key),
        status: "active-session",
        agent,
        session,
        runId: session.currentRunId,
        currentTool: session.currentTool,
        updatedAt: session.updatedAt ?? session.lastInteractionAt,
        links: linksFor({ agentId: session.agentId, sessionKey: session.key }),
      } satisfies ActiveWorkItem;
    });

  return [...taskWork, ...sessionOnlyWork].sort((a, b) => {
    const statusRank = rankActiveStatus(a.status) - rankActiveStatus(b.status);
    if (statusRank !== 0) return statusRank;
    return parseTime(b.updatedAt ?? b.startedAt) - parseTime(a.updatedAt ?? a.startedAt);
  });
}

function buildAgentWorkSummaries(
  snapshot: RuntimeSnapshot,
  context: {
    activeWork: ActiveWorkItem[];
    agentsById: Map<string, AgentSummary>;
    pendingApprovals: ApprovalSummary[];
    failedTasks: TaskSummary[];
  },
): AgentWorkSummary[] {
  const sessionsByAgent = new Map<string, SessionSummary[]>();
  for (const session of snapshot.sessions) {
    const agentId = session.agentId ?? "unknown";
    const sessions = sessionsByAgent.get(agentId) ?? [];
    sessions.push(session);
    sessionsByAgent.set(agentId, sessions);
  }

  return snapshot.agents
    .map((agent) => {
      const sessions = sortByActivityDesc(sessionsByAgent.get(agent.id) ?? []);
      const activeWork = context.activeWork.filter((item) => item.agent?.id === agent.id);
      const pendingApprovals = context.pendingApprovals.filter((approval) => approval.agentId === agent.id);
      const failedTasks = context.failedTasks.filter((task) => task.agentId === agent.id);
      const activeSessions = sessions.filter((session) => session.isActive);
      const lastActivityAt = newestTimestamp([
        ...sessions.map((session) => session.updatedAt ?? session.lastInteractionAt),
        ...activeWork.map((item) => item.updatedAt ?? item.startedAt),
        ...failedTasks.map((task) => task.endedAt ?? task.startedAt),
      ]);

      return {
        agent,
        activeWork,
        sessions,
        activeSessions,
        pendingApprovals,
        failedTasks,
        lastActivityAt,
        state: activeWork.length > 0 ? "working" : pendingApprovals.length > 0 || failedTasks.length > 0 ? "attention" : "idle",
      } satisfies AgentWorkSummary;
    })
    .sort((a, b) => {
      const stateRank = rankAgentState(a.state) - rankAgentState(b.state);
      if (stateRank !== 0) return stateRank;
      return parseTime(b.lastActivityAt) - parseTime(a.lastActivityAt);
    });
}

function buildAttentionItems(
  snapshot: RuntimeSnapshot,
  context: {
    agentsById: Map<string, AgentSummary>;
    sessionsByKey: Map<string, SessionSummary>;
    pendingApprovals: ApprovalSummary[];
    failedTasks: TaskSummary[];
    nowMs: number;
    snapshotStaleAfterMs: number;
    activeSessionStaleAfterMs: number;
    longRunningTaskAfterMs: number;
  },
): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (snapshot.connectionState !== "connected") {
    items.push({
      id: "gateway:connection",
      kind: "gateway",
      tone: "error",
      title: "Gateway is not connected",
      summary: `Connection state is ${snapshot.connectionState}.`,
      timestamp: snapshot.updatedAt,
      links: { timeline: "/timeline" },
    });
  }

  if (snapshot.health?.ok === false || snapshot.health?.degraded === true) {
    items.push({
      id: "gateway:health",
      kind: "health",
      tone: snapshot.health.ok === false ? "error" : "warn",
      title: snapshot.health.ok === false ? "Gateway health check is failing" : "Gateway health is degraded",
      timestamp: snapshot.updatedAt,
      links: { timeline: "/timeline" },
    });
  }

  if (isOlderThan(snapshot.updatedAt, context.nowMs, context.snapshotStaleAfterMs)) {
    items.push({
      id: "snapshot:stale",
      kind: "stale-snapshot",
      tone: "warn",
      title: "Runtime snapshot is stale",
      summary: `Last update was ${formatAge(snapshot.updatedAt, context.nowMs)} ago.`,
      timestamp: snapshot.updatedAt,
      links: { timeline: "/timeline" },
    });
  }

  for (const task of context.failedTasks) {
    const session = task.sessionKey ? context.sessionsByKey.get(task.sessionKey) : undefined;
    const agentId = task.agentId ?? session?.agentId;
    items.push({
      id: `task-failed:${task.id}`,
      kind: "task-failed",
      tone: "error",
      title: task.title ?? task.id,
      summary: task.error ?? `Task ${task.status}.`,
      agent: agentId ? context.agentsById.get(agentId) : undefined,
      session,
      task,
      timestamp: task.endedAt ?? task.startedAt,
      links: linksFor({ agentId, sessionKey: session?.key ?? task.sessionKey, taskId: task.id }),
    });
  }

  for (const approval of context.pendingApprovals) {
    const session = approval.sessionKey ? context.sessionsByKey.get(approval.sessionKey) : undefined;
    const agentId = approval.agentId ?? session?.agentId;
    items.push({
      id: `approval:${approval.id}`,
      kind: "approval",
      tone: "warn",
      title: approval.kind === "exec" ? "Execution approval pending" : "Plugin approval pending",
      summary: approval.command,
      agent: agentId ? context.agentsById.get(agentId) : undefined,
      session,
      approval,
      timestamp: approval.requestedAt,
      links: linksFor({ agentId, sessionKey: session?.key ?? approval.sessionKey, approvalId: approval.id }),
    });
  }

  for (const task of snapshot.tasks.filter((candidate) => candidate.status === "running")) {
    if (!isOlderThan(task.startedAt, context.nowMs, context.longRunningTaskAfterMs)) continue;
    const session = task.sessionKey ? context.sessionsByKey.get(task.sessionKey) : undefined;
    const agentId = task.agentId ?? session?.agentId;
    items.push({
      id: `task-long-running:${task.id}`,
      kind: "long-running-task",
      tone: "warn",
      title: task.title ?? task.id,
      summary: `Running for ${formatAge(task.startedAt, context.nowMs)}.`,
      agent: agentId ? context.agentsById.get(agentId) : undefined,
      session,
      task,
      timestamp: task.startedAt,
      links: linksFor({ agentId, sessionKey: session?.key ?? task.sessionKey, taskId: task.id }),
    });
  }

  for (const session of snapshot.sessions.filter((candidate) => candidate.isActive)) {
    const updatedAt = session.updatedAt ?? session.lastInteractionAt;
    if (!isOlderThan(updatedAt, context.nowMs, context.activeSessionStaleAfterMs)) continue;
    items.push({
      id: `session-stale:${session.key}`,
      kind: "stale-active-session",
      tone: "warn",
      title: session.label ?? shortSessionKey(session.key),
      summary: `Active session has no update for ${formatAge(updatedAt, context.nowMs)}.`,
      agent: session.agentId ? context.agentsById.get(session.agentId) : undefined,
      session,
      timestamp: updatedAt,
      links: linksFor({ agentId: session.agentId, sessionKey: session.key }),
    });
  }

  return items.sort(compareAttention);
}

function filterMeaningfulEvents(events: TimelineEvent[]): TimelineEvent[] {
  return events.filter((event) => !NOISE_EVENT_KINDS.has(event.kind));
}

function compareAttention(a: AttentionItem, b: AttentionItem): number {
  const toneRank = rankTone(a.tone) - rankTone(b.tone);
  if (toneRank !== 0) return toneRank;
  return parseTime(b.timestamp) - parseTime(a.timestamp);
}

function compareEventsDesc(a: TimelineEvent, b: TimelineEvent): number {
  return parseTime(b.timestamp) - parseTime(a.timestamp);
}

function rankTone(tone: AttentionTone): number {
  if (tone === "error") return 0;
  if (tone === "warn") return 1;
  return 2;
}

function rankActiveStatus(status: ActiveWorkItem["status"]): number {
  if (status === "running") return 0;
  if (status === "active-session") return 1;
  return 2;
}

function rankAgentState(state: AgentWorkSummary["state"]): number {
  if (state === "working") return 0;
  if (state === "attention") return 1;
  return 2;
}

function sortByActivityDesc(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort(
    (a, b) => parseTime(b.updatedAt ?? b.lastInteractionAt) - parseTime(a.updatedAt ?? a.lastInteractionAt),
  );
}

function shortSessionKey(key: string): string {
  const parts = key.split(":");
  if (parts.length >= 5 && parts[2] === "discord") return `discord:${parts[parts.length - 1]?.slice(0, 8)}...`;
  if (parts.length >= 4) return `${parts[2]}:${parts[3]?.slice(0, 8)}...`;
  return key.length > 42 ? `${key.slice(0, 40)}...` : key;
}

function mapBy<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(key(item), item);
  return map;
}

function isOlderThan(iso: string | undefined, nowMs: number, thresholdMs: number): boolean {
  const ms = parseTime(iso);
  if (ms === 0) return false;
  return nowMs - ms > thresholdMs;
}

function parseTime(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

function newestTimestamp(values: Array<string | undefined>): string | undefined {
  const newest = values
    .map((value) => ({ value, ms: parseTime(value) }))
    .filter((item): item is { value: string; ms: number } => Boolean(item.value) && item.ms > 0)
    .sort((a, b) => b.ms - a.ms)[0];
  return newest?.value;
}

function formatAge(iso: string | undefined, nowMs: number): string {
  const ms = parseTime(iso);
  if (ms === 0) return "unknown time";
  const delta = Math.max(0, nowMs - ms);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
