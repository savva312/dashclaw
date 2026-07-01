import type {
  AgentSummary,
  ApprovalSummary,
  CronJobSummary,
  RuntimeSnapshot,
  SessionSummary,
  TaskSummary,
  TimelineEvent,
} from "@dashclaw/runtime-model";

export type AttentionTone = "error" | "warn" | "info";
export type AttentionCategory = "intervention" | "access" | "security";
export type AttentionKind =
  | "gateway"
  | "health"
  | "stale-snapshot"
  | "task-failed"
  | "lost-task"
  | "approval"
  | "access"
  | "security-posture"
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

export type WorkGraphNodeKind = "agent" | "session" | "task" | "cron";
export type WorkGraphNodeRole = "agent" | "session" | "dashboard" | "subagent" | "acp" | "cron" | "task";
export type WorkGraphStatus =
  | "active"
  | "queued"
  | "running"
  | "scheduled"
  | "idle"
  | "completed"
  | "failed"
  | "lost"
  | "disabled";

export interface WorkGraphNode {
  id: string;
  label: string;
  kind: WorkGraphNodeKind;
  role: WorkGraphNodeRole;
  status: WorkGraphStatus;
  agent?: AgentSummary;
  session?: SessionSummary;
  task?: TaskSummary;
  cronJob?: CronJobSummary;
  parentId?: string;
  currentTool?: string;
  startedAt?: string;
  updatedAt?: string;
  links: RuntimeLinks;
  children: WorkGraphNode[];
}

export interface WorkGraphEdge {
  from: string;
  to: string;
  kind: "owns" | "runs" | "scheduled";
}

export interface WorkGraphModel {
  roots: WorkGraphNode[];
  nodes: WorkGraphNode[];
  edges: WorkGraphEdge[];
  summary: {
    roots: number;
    children: number;
    active: number;
    failed: number;
    lost: number;
    hiddenInactive: number;
  };
}

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  category: AttentionCategory;
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

export interface InterventionSummary {
  tone: AttentionTone | "ok";
  headline: string;
  counts: {
    total: number;
    error: number;
    warn: number;
    info: number;
    intervention: number;
    access: number;
    security: number;
  };
  items: AttentionItem[];
}

export interface RuntimeStatusSummary {
  tone: AttentionTone | "ok";
  label: string;
  summary: string;
  empty: boolean;
}

export interface DashboardModel {
  generatedAt: string;
  connectionState: RuntimeSnapshot["connectionState"];
  isLive: boolean;
  isStale: boolean;
  runtimeStatus: RuntimeStatusSummary;
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
  workGraph: WorkGraphModel;
  attention: AttentionItem[];
  interventionSummary: InterventionSummary;
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
  const workGraph = buildWorkGraphModel(snapshot, timeline, {
    nowMs,
    activeSessionStaleAfterMs,
  });
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
  const isLive = snapshot.connectionState === "connected" && !isStale && snapshot.health?.degraded !== true;
  const workingAgents = agents.filter((agent) => agent.state === "working").length;

  return {
    generatedAt: new Date(nowMs).toISOString(),
    connectionState: snapshot.connectionState,
    isLive,
    isStale,
    runtimeStatus: buildRuntimeStatusSummary(snapshot, { isLive, isStale, nowMs }),
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
    workGraph,
    attention,
    interventionSummary: buildInterventionSummary(attention),
    recentEvents,
  };
}

function buildRuntimeStatusSummary(
  snapshot: RuntimeSnapshot,
  context: { isLive: boolean; isStale: boolean; nowMs: number },
): RuntimeStatusSummary {
  const empty =
    snapshot.agents.length === 0 &&
    snapshot.sessions.length === 0 &&
    snapshot.tasks.length === 0 &&
    snapshot.cronJobs.length === 0 &&
    snapshot.approvals.length === 0 &&
    snapshot.nodes.length === 0;

  if (snapshot.connectionState !== "connected") {
    return {
      tone: "error",
      label: "Gateway disconnected",
      summary: `Dashclaw has a ${snapshot.connectionState} gateway connection; data may be cached from ${formatAge(snapshot.updatedAt, context.nowMs)} ago.`,
      empty,
    };
  }

  if (snapshot.health?.ok === false) {
    return {
      tone: "error",
      label: "Gateway unhealthy",
      summary: "The gateway health check is failing. Inspect the access/intervention queue before trusting runtime state.",
      empty,
    };
  }

  if (snapshot.health?.degraded === true) {
    return {
      tone: "warn",
      label: "Gateway degraded",
      summary: "Dashclaw is connected, but the gateway reports degraded health. Some runtime surfaces may be incomplete.",
      empty,
    };
  }

  if (context.isStale) {
    return {
      tone: "warn",
      label: "Snapshot stale",
      summary: `The last runtime snapshot arrived ${formatAge(snapshot.updatedAt, context.nowMs)} ago. Refresh or check the event stream if this looks wrong.`,
      empty,
    };
  }

  if (empty) {
    return {
      tone: "info",
      label: "No runtime work yet",
      summary: "Gateway is live, but it has not reported agents, sessions, tasks, approvals, cron jobs, or nodes yet.",
      empty,
    };
  }

  return {
    tone: context.isLive ? "ok" : "info",
    label: context.isLive ? "Gateway live" : "Runtime state needs review",
    summary: "Dashboard state is current. Use graph, intervention, and ledger links to drill into active work.",
    empty,
  };
}

export function buildInterventionSummary(attention: AttentionItem[]): InterventionSummary {
  const counts = attention.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.tone] += 1;
      acc[item.category] += 1;
      return acc;
    },
    { total: 0, error: 0, warn: 0, info: 0, intervention: 0, access: 0, security: 0 },
  );

  const tone: InterventionSummary["tone"] =
    counts.error > 0 ? "error" : counts.warn > 0 ? "warn" : counts.info > 0 ? "info" : "ok";
  const headline =
    tone === "ok"
      ? "No intervention needed"
      : counts.error > 0
        ? `${counts.error} critical item${counts.error === 1 ? "" : "s"} need attention`
        : `${counts.warn} warning${counts.warn === 1 ? "" : "s"} to review`;

  return {
    tone,
    headline,
    counts,
    items: attention,
  };
}

export function buildWorkGraphModel(
  snapshot: RuntimeSnapshot,
  timeline: TimelineEvent[],
  options: Pick<DashboardModelOptions, "nowMs" | "activeSessionStaleAfterMs"> = {},
): WorkGraphModel {
  const nowMs = options.nowMs ?? Date.now();
  const activeSessionStaleAfterMs =
    options.activeSessionStaleAfterMs ?? DEFAULT_ACTIVE_SESSION_STALE_AFTER_MS;
  const agentsById = mapBy(snapshot.agents, (agent) => agent.id);
  const sessionsByKey = mapBy(snapshot.sessions, (session) => session.key);
  const sessionParentHints = buildSessionParentHints(timeline);
  const nodes = new Map<string, WorkGraphNode>();

  for (const agent of snapshot.agents) {
    const hasActiveWork =
      snapshot.sessions.some(
        (session) =>
          session.agentId === agent.id &&
          isActiveWorkGraphStatus(workStatusForSession(session, nowMs, activeSessionStaleAfterMs)),
      ) ||
      snapshot.tasks.some((task) => task.agentId === agent.id && (task.status === "running" || task.status === "queued"));
    const hasFailedWork = snapshot.tasks.some(
      (task) => task.agentId === agent.id && (task.status === "failed" || task.status === "timed_out"),
    );
    nodes.set(`agent:${agent.id}`, {
      id: `agent:${agent.id}`,
      label: agent.name ?? agent.id,
      kind: "agent",
      role: "agent",
      status: hasActiveWork ? "active" : hasFailedWork ? "failed" : "idle",
      agent,
      updatedAt: newestTimestamp([
        ...snapshot.sessions
          .filter((session) => session.agentId === agent.id)
          .map((session) => session.updatedAt ?? session.lastInteractionAt),
        ...snapshot.tasks
          .filter((task) => task.agentId === agent.id)
          .map((task) => task.endedAt ?? task.startedAt),
      ]),
      links: linksFor({ agentId: agent.id }),
      children: [],
    });
  }

  for (const session of snapshot.sessions) {
    const role = workRoleForSession(session);
    const parentSessionKey = session.parentSessionKey ?? session.spawnedBy ?? session.ownerSessionKey ?? sessionParentHints.get(session.key);
    const parentId =
      parentSessionKey && parentSessionKey !== session.key && sessionsByKey.has(parentSessionKey)
        ? `session:${parentSessionKey}`
        : session.agentId && agentsById.has(session.agentId)
          ? `agent:${session.agentId}`
          : undefined;

    nodes.set(`session:${session.key}`, {
      id: `session:${session.key}`,
      label: session.label ?? shortSessionKey(session.key),
      kind: "session",
      role,
      status: workStatusForSession(session, nowMs, activeSessionStaleAfterMs),
      agent: session.agentId ? agentsById.get(session.agentId) : undefined,
      session,
      parentId,
      currentTool: session.currentTool,
      updatedAt: session.updatedAt ?? session.lastInteractionAt,
      links: linksFor({ agentId: session.agentId, sessionKey: session.key }),
      children: [],
    });
  }

  for (const task of snapshot.tasks.filter(includeTaskInWorkGraph)) {
    const session = task.sessionKey ? sessionsByKey.get(task.sessionKey) : undefined;
    const agentId = task.agentId ?? session?.agentId;
    const parentId =
      task.sessionKey && nodes.has(`session:${task.sessionKey}`)
        ? `session:${task.sessionKey}`
        : agentId && nodes.has(`agent:${agentId}`)
          ? `agent:${agentId}`
          : undefined;

    nodes.set(`task:${task.id}`, {
      id: `task:${task.id}`,
      label: task.title ?? task.id,
      kind: "task",
      role: "task",
      status: workStatusForTask(task),
      agent: agentId ? agentsById.get(agentId) : undefined,
      session,
      task,
      parentId,
      startedAt: task.startedAt,
      updatedAt: task.endedAt ?? task.startedAt,
      links: linksFor({ agentId, sessionKey: session?.key ?? task.sessionKey, taskId: task.id }),
      children: [],
    });
  }

  for (const cronJob of snapshot.cronJobs) {
    const parentSession = findCronSessionForJob(cronJob, snapshot.sessions);
    const parentId = parentSession && nodes.has(`session:${parentSession.key}`) ? `session:${parentSession.key}` : undefined;
    nodes.set(`cron:${cronJob.id}`, {
      id: `cron:${cronJob.id}`,
      label: cronJob.name ?? cronJob.id,
      kind: "cron",
      role: "cron",
      status: workStatusForCron(cronJob),
      cronJob,
      parentId,
      startedAt: cronJob.lastRunAt,
      updatedAt: newestTimestamp([cronJob.nextRunAt, cronJob.lastRunAt]),
      links: { timeline: "/timeline" },
      children: [],
    });
  }

  const allNodes = [...nodes.values()];
  const edges: WorkGraphEdge[] = [];
  const roots: WorkGraphNode[] = [];
  for (const node of allNodes) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && parent.id !== node.id) {
      parent.children.push(node);
      edges.push({ from: parent.id, to: node.id, kind: edgeKindFor(parent, node) });
    } else {
      roots.push(node);
    }
  }

  sortWorkGraphNodes(roots);
  for (const node of allNodes) sortWorkGraphNodes(node.children);

  const childNodes = allNodes.filter((node) => node.kind !== "agent");
  return {
    roots,
    nodes: allNodes.sort(compareWorkGraphNodes),
    edges,
    summary: {
      roots: roots.length,
      children: childNodes.length,
      active: childNodes.filter((node) => isActiveWorkGraphStatus(node.status)).length,
      failed: childNodes.filter((node) => node.status === "failed").length,
      lost: childNodes.filter((node) => node.status === "lost").length,
      hiddenInactive: childNodes.filter((node) => !isActiveWorkGraphStatus(node.status)).length,
    },
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
      category: "access",
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
      category: "access",
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
      category: "access",
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
      category: "intervention",
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

  for (const task of snapshot.tasks.filter((candidate) => candidate.status === "running" || candidate.status === "queued")) {
    const session = task.sessionKey ? context.sessionsByKey.get(task.sessionKey) : undefined;
    const agentId = task.agentId ?? session?.agentId;
    const hasKnownAgent = agentId ? context.agentsById.has(agentId) : false;
    if (session || hasKnownAgent) continue;

    items.push({
      id: `task-lost:${task.id}`,
      kind: "lost-task",
      category: "intervention",
      tone: "warn",
      title: task.title ?? task.id,
      summary: task.sessionKey
        ? "Task references a session or agent that is not present in the runtime snapshot."
        : "Task has no known session or agent context in the runtime snapshot.",
      task,
      timestamp: task.startedAt,
      links: linksFor({ agentId, sessionKey: task.sessionKey, taskId: task.id }),
    });
  }

  for (const approval of context.pendingApprovals) {
    const session = approval.sessionKey ? context.sessionsByKey.get(approval.sessionKey) : undefined;
    const agentId = approval.agentId ?? session?.agentId;
    const highRisk = isHighRiskApproval(approval);
    items.push({
      id: `approval:${approval.id}`,
      kind: "approval",
      category: highRisk || approval.kind === "plugin" ? "security" : "intervention",
      tone: highRisk ? "error" : "warn",
      title: highRisk
        ? "High-risk approval pending"
        : approval.kind === "exec"
          ? "Execution approval pending"
          : "Plugin approval pending",
      summary: approval.command,
      agent: agentId ? context.agentsById.get(agentId) : undefined,
      session,
      approval,
      timestamp: approval.requestedAt,
      links: linksFor({ agentId, sessionKey: session?.key ?? approval.sessionKey, approvalId: approval.id }),
    });
  }

  for (const task of snapshot.tasks.filter((candidate) => candidate.status === "running" || candidate.status === "queued")) {
    if (!isOlderThan(task.startedAt, context.nowMs, context.longRunningTaskAfterMs)) continue;
    const session = task.sessionKey ? context.sessionsByKey.get(task.sessionKey) : undefined;
    const agentId = task.agentId ?? session?.agentId;
    items.push({
      id: `task-long-running:${task.id}`,
      kind: "long-running-task",
      category: "intervention",
      tone: "warn",
      title: task.title ?? task.id,
      summary: `${task.status === "queued" ? "Queued" : "Running"} for ${formatAge(task.startedAt, context.nowMs)}.`,
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
      category: "intervention",
      tone: "warn",
      title: session.label ?? shortSessionKey(session.key),
      summary: `Active session has no update for ${formatAge(updatedAt, context.nowMs)}.`,
      agent: session.agentId ? context.agentsById.get(session.agentId) : undefined,
      session,
      timestamp: updatedAt,
      links: linksFor({ agentId: session.agentId, sessionKey: session.key }),
    });
  }

  for (const node of snapshot.nodes.filter((candidate) => !candidate.connected)) {
    items.push({
      id: `access-node:${node.id}`,
      kind: "access",
      category: "access",
      tone: "warn",
      title: `${node.label ?? node.id} disconnected`,
      summary: node.platform ? `${node.platform} node is not connected.` : "Node is not connected.",
      timestamp: snapshot.updatedAt,
      links: { timeline: "/timeline" },
    });
  }

  for (const warning of deriveSecurityPostureWarnings(snapshot.health?.raw)) {
    items.push({
      id: `security:${warning.id}`,
      kind: "security-posture",
      category: "security",
      tone: warning.tone,
      title: warning.title,
      summary: warning.summary,
      timestamp: snapshot.updatedAt,
      links: { timeline: "/timeline" },
    });
  }

  return items.sort(compareAttention);
}

function buildSessionParentHints(timeline: TimelineEvent[]): Map<string, string> {
  const hints = new Map<string, string>();
  for (const event of timeline) {
    const childKey = event.sessionKey ?? payloadString(event.payload, "sessionKey", "key", "childSessionKey");
    const parentKey = payloadString(
      event.payload,
      "parentSessionKey",
      "requesterSessionKey",
      "sourceSessionKey",
      "originSessionKey",
    );
    if (childKey && parentKey && childKey !== parentKey) hints.set(childKey, parentKey);
  }
  return hints;
}

function payloadString(payload: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!payload) return undefined;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  const parent = payload.parent;
  if (parent && typeof parent === "object") {
    for (const key of keys) {
      const value = (parent as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  }
  return undefined;
}

function workRoleForSession(session: SessionSummary): WorkGraphNodeRole {
  const kind = sessionKind(session.key);
  if (kind === "dashboard") return "dashboard";
  if (kind === "subagent") return "subagent";
  if (kind === "acp") return "acp";
  if (kind === "cron") return "cron";
  return "session";
}

function workStatusForSession(
  session: SessionSummary,
  nowMs: number,
  activeSessionStaleAfterMs: number,
): WorkGraphStatus {
  const status = normalizeWorkStatusText(session.status);
  if (status === "failed") return "failed";
  if (status === "lost") return "lost";
  if (status === "completed") return "completed";
  if (session.isActive && isOlderThan(session.updatedAt ?? session.lastInteractionAt, nowMs, activeSessionStaleAfterMs)) {
    return "lost";
  }
  if (status === "queued") return "queued";
  if (status === "running" || session.isActive || session.currentRunId) return "active";
  return "idle";
}

function includeTaskInWorkGraph(task: TaskSummary): boolean {
  return task.status === "running" || task.status === "queued" || task.status === "failed" || task.status === "timed_out";
}

function workStatusForTask(task: TaskSummary): WorkGraphStatus {
  if (task.status === "running") return "running";
  if (task.status === "queued") return "queued";
  if (task.status === "failed") return "failed";
  if (task.status === "timed_out") return "lost";
  if (task.status === "completed") return "completed";
  return "idle";
}

function workStatusForCron(cronJob: CronJobSummary): WorkGraphStatus {
  if (!cronJob.enabled) return "disabled";
  if (cronJob.lastStatus === "failed" || cronJob.lastStatus === "error") return "failed";
  if (cronJob.lastStatus === "running") return "running";
  if (cronJob.nextRunAt) return "scheduled";
  return "idle";
}

function findCronSessionForJob(cronJob: CronJobSummary, sessions: SessionSummary[]): SessionSummary | undefined {
  const candidates = sessions.filter((session) => workRoleForSession(session) === "cron");
  return candidates.find((session) => session.key.includes(cronJob.id) || session.label === cronJob.name);
}

function edgeKindFor(parent: WorkGraphNode, child: WorkGraphNode): WorkGraphEdge["kind"] {
  if (child.kind === "cron") return "scheduled";
  if (parent.kind === "session" || child.kind === "task") return "runs";
  return "owns";
}

function sortWorkGraphNodes(nodes: WorkGraphNode[]): void {
  nodes.sort(compareWorkGraphNodes);
}

function compareWorkGraphNodes(a: WorkGraphNode, b: WorkGraphNode): number {
  const statusRank = rankWorkGraphStatus(a.status) - rankWorkGraphStatus(b.status);
  if (statusRank !== 0) return statusRank;
  const timeRank = parseTime(b.updatedAt ?? b.startedAt) - parseTime(a.updatedAt ?? a.startedAt);
  if (timeRank !== 0) return timeRank;
  return a.label.localeCompare(b.label);
}

function rankWorkGraphStatus(status: WorkGraphStatus): number {
  if (status === "failed" || status === "lost") return 0;
  if (status === "running" || status === "active") return 1;
  if (status === "queued") return 2;
  if (status === "scheduled") return 3;
  if (status === "idle") return 4;
  if (status === "completed") return 5;
  return 6;
}

function isActiveWorkGraphStatus(status: WorkGraphStatus): boolean {
  return status === "active" || status === "running" || status === "queued";
}

function normalizeWorkStatusText(status: string | undefined): "running" | "queued" | "completed" | "failed" | "lost" | undefined {
  if (!status) return undefined;
  const normalized = status.toLowerCase().replace(/[ -]/g, "_");
  if (normalized === "running" || normalized === "active" || normalized === "processing" || normalized === "streaming") {
    return "running";
  }
  if (normalized === "queued" || normalized === "pending") return "queued";
  if (
    normalized === "completed" ||
    normalized === "complete" ||
    normalized === "done" ||
    normalized === "final" ||
    normalized === "success" ||
    normalized === "succeeded"
  ) {
    return "completed";
  }
  if (normalized === "failed" || normalized === "failure" || normalized === "error") return "failed";
  if (normalized === "timeout" || normalized === "timed_out" || normalized === "lost" || normalized === "stale") return "lost";
  return undefined;
}

function sessionKind(key: string): string {
  const parts = key.split(":");
  if (parts.length >= 3 && parts[0] === "agent") return parts[2] ?? "session";
  if (parts.length >= 4 && parts[0] === "session" && parts[1] === "agent") return parts[2] ?? "session";
  return parts[2] ?? "session";
}

function filterMeaningfulEvents(events: TimelineEvent[]): TimelineEvent[] {
  return events.filter((event) => !NOISE_EVENT_KINDS.has(event.kind));
}

function compareAttention(a: AttentionItem, b: AttentionItem): number {
  const toneRank = rankTone(a.tone) - rankTone(b.tone);
  if (toneRank !== 0) return toneRank;
  const kindRank = rankAttentionKind(a.kind) - rankAttentionKind(b.kind);
  if (kindRank !== 0) return kindRank;
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

function rankAttentionKind(kind: AttentionKind): number {
  switch (kind) {
    case "gateway":
      return 0;
    case "health":
      return 1;
    case "security-posture":
      return 2;
    case "approval":
      return 3;
    case "task-failed":
      return 4;
    case "lost-task":
      return 5;
    case "access":
      return 6;
    case "long-running-task":
      return 7;
    case "stale-active-session":
      return 8;
    case "stale-snapshot":
      return 9;
  }
}

function isHighRiskApproval(approval: ApprovalSummary): boolean {
  if (approval.kind === "plugin") return true;
  const command = approval.command?.toLowerCase() ?? "";
  return (
    /\b(sudo|su|chmod|chown|iptables|ufw|systemctl|service|mount|umount|mkfs|dd|curl|wget|nc|netcat)\b/.test(command) ||
    /\brm\s+(-[^\s]*[rf]|[^\s]*\*)/.test(command) ||
    /\|\s*(sh|bash)\b/.test(command) ||
    />\s*\/(etc|usr|bin|sbin|boot|var)\b/.test(command)
  );
}

function deriveSecurityPostureWarnings(raw: Record<string, unknown> | undefined): Array<{
  id: string;
  tone: AttentionTone;
  title: string;
  summary?: string;
}> {
  if (!raw) return [];
  const warnings: Array<{ id: string; tone: AttentionTone; title: string; summary?: string }> = [];

  if (hasDisabledAuth(raw)) {
    warnings.push({
      id: "auth-disabled",
      tone: "error",
      title: "Gateway authentication appears disabled",
      summary: "Health metadata reports auth disabled or not required.",
    });
  }

  if (hasWriteWithoutApproval(raw)) {
    warnings.push({
      id: "approval-bypass",
      tone: "warn",
      title: "Write approvals may be bypassed",
      summary: "Health metadata reports writes or high-risk actions without approval requirements.",
    });
  }

  return warnings;
}

function hasDisabledAuth(value: unknown): boolean {
  return walkPosture(value, (key, candidate) => {
    const normalized = key.toLowerCase();
    if (!/(auth|authentication|token|login)/.test(normalized)) return false;
    return candidate === false || candidate === "false" || candidate === "disabled" || candidate === "none";
  });
}

function hasWriteWithoutApproval(value: unknown): boolean {
  return walkPosture(value, (key, candidate) => {
    const normalized = key.toLowerCase();
    if (/(allowwriteswithoutapproval|bypassapproval|approvalbypass)/.test(normalized)) {
      return candidate === true || candidate === "true" || candidate === "enabled";
    }
    if (/(approvalrequired|requiresapproval|confirmationsrequired)/.test(normalized)) {
      return candidate === false || candidate === "false" || candidate === "disabled";
    }
    return false;
  });
}

function walkPosture(value: unknown, predicate: (key: string, candidate: unknown) => boolean, path = ""): boolean {
  if (!value || typeof value !== "object") return false;
  for (const [key, candidate] of Object.entries(value as Record<string, unknown>)) {
    const scopedKey = path ? `${path}.${key}` : key;
    if (predicate(scopedKey, candidate)) return true;
    if (candidate && typeof candidate === "object" && walkPosture(candidate, predicate, scopedKey)) return true;
  }
  return false;
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
