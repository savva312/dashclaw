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
  discord?: string;
}

export type OperatorActionId =
  | "open-work-board"
  | "open-graph"
  | "open-agent"
  | "open-session"
  | "open-task"
  | "open-approval"
  | "open-timeline"
  | "steer-session"
  | "abort-session"
  | "cancel-task"
  | "retry-task"
  | "copy-result"
  | "resend-result"
  | "inject-result"
  | "retry-delivery"
  | "approve-approval"
  | "deny-approval";

export type OperatorActionKind = "navigation" | "steering" | "approval" | "recovery";
export type OperatorActionRisk = "none" | "medium" | "high";
export type OperatorActionSource = "runtime-link" | "declared-rpc" | "missing-metadata";

export interface OperatorAction {
  id: OperatorActionId;
  label: string;
  kind: OperatorActionKind;
  enabled: boolean;
  risk: OperatorActionRisk;
  source: OperatorActionSource;
  href?: string;
  rpcMethod?: string;
  rpcParams?: Record<string, string>;
  requiresConfirmation?: boolean;
  disabledReason?: string;
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
  deliveryRecovery?: DeliveryRecoveryState;
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

export type ControlCenterLane =
  | "activeNow"
  | "waitingOnMe"
  | "attention"
  | "recentlyCompleted"
  | "failedRecoverable";

export interface ControlCenterItem {
  id: string;
  lane: ControlCenterLane;
  tone: AttentionTone | "ok";
  title: string;
  summary?: string;
  status: string;
  agentLabel?: string;
  sessionLabel?: string;
  currentAction?: string;
  nextAction: string;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  links: RuntimeLinks;
  operatorActions?: OperatorAction[];
  agent?: AgentSummary;
  session?: SessionSummary;
  task?: TaskSummary;
  approval?: ApprovalSummary;
}

export interface ControlCenterOverview {
  activeNow: ControlCenterItem[];
  waitingOnMe: ControlCenterItem[];
  attention: ControlCenterItem[];
  recentlyCompleted: ControlCenterItem[];
  failedRecoverable: ControlCenterItem[];
}

export type WorkItemState = "inbox" | "active" | "waiting" | "review" | "done" | "failed";
export type WorkItemLineageQuality = "complete" | "partial" | "missing";

export interface WorkItemEvidence {
  agents: AgentSummary[];
  sessions: SessionSummary[];
  tasks: TaskSummary[];
  approvals: ApprovalSummary[];
  events: TimelineEvent[];
}

export interface WorkItemLineage {
  quality: WorkItemLineageQuality;
  diagnostic?: string;
}

export type DeliveryRecoveryStatus =
  | "delivered"
  | "queued"
  | "failed-delivery"
  | "lost-parent"
  | "silent-terminal"
  | "unknown";

export interface DeliveryRecoveryAction {
  label: string;
  disabledReason: string;
}

export interface DeliveryRecoveryEvidence {
  label: string;
  href?: string;
  detail?: string;
  source?: "task" | "session" | "timeline" | "lineage" | "metadata";
  certainty?: "known" | "inferred" | "missing";
}

export interface DeliveryRecoveryState {
  status: DeliveryRecoveryStatus;
  label: string;
  tone: AttentionTone | "ok" | "neutral";
  summary: string;
  known: boolean;
  inferred: boolean;
  resultVisible: boolean;
  needsRecovery: boolean;
  metadataGaps: string[];
  evidence: DeliveryRecoveryEvidence[];
  disabledActions: DeliveryRecoveryAction[];
}

export interface DeliveryRecoveryQueueItem {
  id: string;
  status: DeliveryRecoveryStatus;
  tone: AttentionTone | "ok" | "neutral";
  title: string;
  summary: string;
  nextAction: string;
  agent?: AgentSummary;
  session?: SessionSummary;
  task: TaskSummary;
  events: TimelineEvent[];
  links: RuntimeLinks;
  deliveryRecovery: DeliveryRecoveryState;
  operatorActions: OperatorAction[];
}

export interface DeliveryRecoveryQueueModel {
  items: DeliveryRecoveryQueueItem[];
  summary: {
    total: number;
    delivered: number;
    queued: number;
    failedDelivery: number;
    lostParent: number;
    silentTerminal: number;
    unknown: number;
  };
  metadataGaps: string[];
}

export interface WorkItem {
  id: string;
  title: string;
  state: WorkItemState;
  tone: AttentionTone | "ok";
  summary?: string;
  ageLabel: string;
  createdAt?: string;
  updatedAt?: string;
  agentLabel?: string;
  sessionLabel?: string;
  currentAction?: string;
  lineage: WorkItemLineage;
  deliveryRecovery: DeliveryRecoveryState;
  evidence: WorkItemEvidence;
  links: RuntimeLinks;
  operatorActions?: OperatorAction[];
}

export interface WorkBoardColumn {
  id: WorkItemState;
  label: string;
  items: WorkItem[];
}

export interface WorkBoardModel {
  items: WorkItem[];
  columns: WorkBoardColumn[];
  summary: Record<WorkItemState, number>;
}

export type ReviewItemKind = "completed" | "failed" | "cancelled" | "changed" | "needs-review" | "stale";

export interface ReviewItem {
  id: string;
  kind: ReviewItemKind;
  categories: ReviewItemKind[];
  tone: AttentionTone | "ok";
  title: string;
  summary?: string;
  status: string;
  nextAction: string;
  ageLabel: string;
  updatedAt?: string;
  changedAt?: string;
  completedAt?: string;
  lastSeenAt?: string;
  sinceLastSeen: boolean;
  delivered: boolean;
  deliveryStatus?: string;
  deliveryRecovery: DeliveryRecoveryState;
  agentLabel?: string;
  sessionLabel?: string;
  links: RuntimeLinks;
  workItem: WorkItem;
  task?: TaskSummary;
  events: TimelineEvent[];
}

export interface ReviewQueueModel {
  items: ReviewItem[];
  recentlyCompleted: ReviewItem[];
  recentlyFailed: ReviewItem[];
  changedSinceLastSeen: ReviewItem[];
  needsReview: ReviewItem[];
  stale: ReviewItem[];
  lastSeenAt?: string;
  summary: {
    total: number;
    recentlyCompleted: number;
    recentlyFailed: number;
    changedSinceLastSeen: number;
    needsReview: number;
    stale: number;
    cancelled: number;
    delivered: number;
  };
}

export type ThreadSessionMapSourceKind = "channel" | "thread" | "session" | "task" | "approval";
export type ThreadSessionMapState = "active" | "waiting" | "queued" | "completed" | "failed" | "archived" | "stale" | "unknown";

export interface ThreadSessionMapSource {
  kind: ThreadSessionMapSourceKind;
  key: string;
  label: string;
  platform?: string;
  channelId?: string;
  channelName?: string;
  threadId?: string;
  threadName?: string;
  permalink?: string;
  archived?: boolean;
  metadataSource: "raw" | "key" | "missing";
}

export interface ThreadSessionMapEntry {
  id: string;
  source: ThreadSessionMapSource;
  parentSession?: SessionSummary;
  childSessions: SessionSummary[];
  sessions: SessionSummary[];
  tasks: TaskSummary[];
  runIds: string[];
  approvals: ApprovalSummary[];
  agents: AgentSummary[];
  state: ThreadSessionMapState;
  tone: AttentionTone | "ok";
  lineage: WorkItemLineage;
  updatedAt?: string;
  links: RuntimeLinks;
}

export interface ThreadSessionMapModel {
  entries: ThreadSessionMapEntry[];
  summary: {
    total: number;
    channels: number;
    threads: number;
    sessions: number;
    orphanedTasks: number;
    orphanedApprovals: number;
    partialLineage: number;
    missingLineage: number;
  };
  metadataGaps: string[];
}

export interface RuntimeStatusSummary {
  tone: AttentionTone | "ok";
  label: string;
  summary: string;
  empty: boolean;
}

export type ApprovalCockpitStatus =
  | "pending"
  | "resolved"
  | "expired"
  | "consumed"
  | "unknown-id"
  | "sync-issue"
  | "full-mode-warning"
  | "unknown";

export interface ApprovalCockpitActionState {
  label: string;
  disabledReason: string;
}

export interface ApprovalCockpitItem {
  id: string;
  kind: ApprovalSummary["kind"] | "unknown";
  status: ApprovalCockpitStatus;
  title: string;
  statusLabel: string;
  tone: AttentionTone | "ok";
  command: string;
  cwd?: string;
  host?: string;
  decisionScope?: string;
  expiresAt?: string;
  resolvedAt?: string;
  consumedAt?: string;
  failureReason?: string;
  commandRiskSignals: string[];
  origin: {
    agentId?: string;
    sessionKey?: string;
    taskId?: string;
    runId?: string;
  };
  requestedAt?: string;
  timeout?: string;
  riskSummary: string;
  policyLayers: string[];
  syncHints: string[];
  metadataGaps: string[];
  evidence: DeliveryRecoveryEvidence[];
  disabledActions: ApprovalCockpitActionState[];
  links: RuntimeLinks;
  approval?: ApprovalSummary;
}

export interface ApprovalCockpitModel {
  items: ApprovalCockpitItem[];
  summary: Record<ApprovalCockpitStatus, number>;
  metadataGaps: string[];
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
  controlCenter: ControlCenterOverview;
  workBoard: WorkBoardModel;
  reviewQueue: ReviewQueueModel;
  deliveryRecoveryQueue: DeliveryRecoveryQueueModel;
  approvalCockpit: ApprovalCockpitModel;
  threadSessionMap: ThreadSessionMapModel;
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
  deliveryRecovery: DeliveryRecoveryState;
}

export interface DashboardModelOptions {
  nowMs?: number;
  snapshotStaleAfterMs?: number;
  activeSessionStaleAfterMs?: number;
  longRunningTaskAfterMs?: number;
  recentEventLimit?: number;
  reviewLastSeenAt?: string;
  reviewQueueLimit?: number;
}

const DEFAULT_SNAPSHOT_STALE_AFTER_MS = 30_000;
const DEFAULT_ACTIVE_SESSION_STALE_AFTER_MS = 5 * 60_000;
const DEFAULT_LONG_RUNNING_TASK_AFTER_MS = 30 * 60_000;
const DEFAULT_RECENT_EVENT_LIMIT = 20;
const DEFAULT_REVIEW_QUEUE_LIMIT = 20;
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
  const workBoard = buildWorkBoardModel(snapshot, timeline, { nowMs });
  const reviewQueue = buildReviewQueueModel(workBoard, {
    nowMs,
    lastSeenAt: options.reviewLastSeenAt,
    staleAfterMs: activeSessionStaleAfterMs,
    itemLimit: options.reviewQueueLimit,
  });
  const deliveryRecoveryQueue = buildDeliveryRecoveryQueueModel(snapshot, timeline);
  const approvalCockpit = buildApprovalCockpitModel(snapshot, timeline, { nowMs });
  const threadSessionMap = buildThreadSessionMapModel(snapshot, timeline, {
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
    controlCenter: buildControlCenterOverview(snapshot, { activeWork, attention, pendingApprovals, failedTasks }),
    workBoard,
    reviewQueue,
    deliveryRecoveryQueue,
    approvalCockpit,
    threadSessionMap,
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

function buildControlCenterOverview(
  snapshot: RuntimeSnapshot,
  context: {
    activeWork: ActiveWorkItem[];
    attention: AttentionItem[];
    pendingApprovals: ApprovalSummary[];
    failedTasks: TaskSummary[];
  },
): ControlCenterOverview {
  const agentsById = mapBy(snapshot.agents, (agent) => agent.id);
  const sessionsByKey = mapBy(snapshot.sessions, (session) => session.key);

  const activeNow = context.activeWork.map((item) => ({
    id: item.id,
    lane: "activeNow",
    tone: item.status === "queued" ? "warn" : "ok",
    title: item.label,
    summary: item.currentTool ? `Current tool: ${item.currentTool}` : undefined,
    status: item.status,
    agentLabel: labelForAgent(item.agent),
    sessionLabel: labelForSession(item.session),
    currentAction: item.currentTool,
    nextAction: item.status === "queued" ? "Wait for the run to start, or inspect queue state." : "Monitor progress or open the linked task/session.",
    startedAt: item.startedAt,
    updatedAt: item.updatedAt,
    links: item.links,
    agent: item.agent,
    session: item.session,
    task: item.task,
    operatorActions: buildOperatorActions({ links: item.links, agent: item.agent, session: item.session, task: item.task }),
  }) satisfies ControlCenterItem);

  const waitingOnMe = context.pendingApprovals
    .map((approval) => {
      const session = approval.sessionKey ? sessionsByKey.get(approval.sessionKey) : undefined;
      const agentId = approval.agentId ?? session?.agentId;
      const agent = agentId ? agentsById.get(agentId) : undefined;
      const highRisk = isHighRiskApproval(approval);
      const links = linksFor({ agentId, sessionKey: session?.key ?? approval.sessionKey, approvalId: approval.id });
      return {
        id: `approval:${approval.id}`,
        lane: "waitingOnMe",
        tone: highRisk ? "error" : "warn",
        title: approval.kind === "exec" ? "Execution approval pending" : "Plugin approval pending",
        summary: approval.command,
        status: "pending approval",
        agentLabel: labelForAgent(agent),
        sessionLabel: labelForSession(session),
        currentAction: approval.command,
        nextAction: highRisk ? "Review command carefully before approving or denying." : "Approve or deny the pending request.",
        updatedAt: approval.requestedAt,
        links,
        agent,
        session,
        approval,
        operatorActions: buildOperatorActions({ links, agent, session, approval }),
      } satisfies ControlCenterItem;
    })
    .sort(compareControlCenterItems);

  const attention = context.attention
    .filter((item) => item.kind !== "approval" && item.kind !== "task-failed")
    .map((item) => controlCenterItemFromAttention(item, "attention"));

  const recentlyCompleted = snapshot.tasks
    .filter((task) => task.status === "completed" || task.status === "cancelled")
    .map((task) => controlCenterItemFromTask(task, "recentlyCompleted", agentsById, sessionsByKey))
    .sort(compareControlCenterItems)
    .slice(0, 8);

  const failedRecoverable = context.failedTasks
    .map((task) => controlCenterItemFromTask(task, "failedRecoverable", agentsById, sessionsByKey))
    .sort(compareControlCenterItems);

  return {
    activeNow,
    waitingOnMe,
    attention,
    recentlyCompleted,
    failedRecoverable,
  };
}

type WorkItemSeed = {
  key: string;
  rootSession?: SessionSummary;
  sessions: SessionSummary[];
  tasks: TaskSummary[];
  approvals: ApprovalSummary[];
  events: TimelineEvent[];
};

const WORK_BOARD_COLUMNS: Array<{ id: WorkItemState; label: string }> = [
  { id: "inbox", label: "Inbox / New" },
  { id: "active", label: "Active" },
  { id: "waiting", label: "Waiting" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done / Recent" },
  { id: "failed", label: "Failed / Recoverable" },
];

export function buildWorkBoardModel(
  snapshot: RuntimeSnapshot,
  timeline: TimelineEvent[],
  options: Pick<DashboardModelOptions, "nowMs"> = {},
): WorkBoardModel {
  const nowMs = options.nowMs ?? Date.now();
  const agentsById = mapBy(snapshot.agents, (agent) => agent.id);
  const sessionsByKey = mapBy(snapshot.sessions, (session) => session.key);
  const tasksById = mapBy(snapshot.tasks, (task) => task.id);
  const sessionParentHints = buildSessionParentHints(timeline);
  const parentSessionKeys = new Set(
    snapshot.sessions
      .map((session) => parentKeyForSession(session, sessionParentHints))
      .filter((key): key is string => Boolean(key)),
  );
  const seeds = new Map<string, WorkItemSeed>();

  const seedFor = (key: string, rootSession?: SessionSummary): WorkItemSeed => {
    const existing = seeds.get(key);
    if (existing) {
      existing.rootSession ??= rootSession;
      return existing;
    }
    const seed = { key, rootSession, sessions: [], tasks: [], approvals: [], events: [] } satisfies WorkItemSeed;
    seeds.set(key, seed);
    return seed;
  };

  const seedForSession = (session: SessionSummary): WorkItemSeed => {
    const rootSession = findWorkRootSession(session, sessionsByKey, sessionParentHints);
    return seedFor(`session:${rootSession.key}`, rootSession);
  };

  for (const session of snapshot.sessions) {
    if (parentSessionKeys.has(session.key) && !hasSessionWorkSignal(session)) continue;
    pushUnique(seedForSession(session).sessions, session, (candidate) => candidate.key);
  }

  for (const task of snapshot.tasks) {
    const session = task.sessionKey ? sessionsByKey.get(task.sessionKey) : undefined;
    const seed = session ? seedForSession(session) : seedFor(`task:${task.id}`);
    pushUnique(seed.tasks, task, (candidate) => candidate.id);
  }

  for (const approval of snapshot.approvals) {
    const session = approval.sessionKey ? sessionsByKey.get(approval.sessionKey) : undefined;
    const seed = session ? seedForSession(session) : seedFor(`approval:${approval.id}`);
    pushUnique(seed.approvals, approval, (candidate) => candidate.id);
  }

  for (const event of filterMeaningfulEvents(timeline)) {
    const task = event.taskId ? tasksById.get(event.taskId) : undefined;
    const sessionKey = task?.sessionKey ?? event.sessionKey;
    const session = sessionKey ? sessionsByKey.get(sessionKey) : undefined;
    const seed = session
      ? seedForSession(session)
      : task
        ? seedFor(`task:${task.id}`)
        : sessionKey || event.taskId
          ? seedFor(`event:${event.id}`)
          : undefined;
    if (seed) pushUnique(seed.events, event, (candidate) => candidate.id);
  }

  const items = [...seeds.values()]
    .map((seed) => workItemFromSeed(seed, { agentsById, sessionsByKey, sessionParentHints, nowMs }))
    .sort(compareWorkItems);
  const summary = emptyWorkBoardSummary();
  for (const item of items) summary[item.state] += 1;

  return {
    items,
    columns: WORK_BOARD_COLUMNS.map((column) => ({
      ...column,
      items: items.filter((item) => item.state === column.id),
    })),
    summary,
  };
}

export function buildReviewQueueModel(
  workBoard: WorkBoardModel,
  options: {
    nowMs?: number;
    lastSeenAt?: string;
    staleAfterMs?: number;
    itemLimit?: number;
  } = {},
): ReviewQueueModel {
  const nowMs = options.nowMs ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_ACTIVE_SESSION_STALE_AFTER_MS;
  const itemLimit = options.itemLimit ?? DEFAULT_REVIEW_QUEUE_LIMIT;
  const items = workBoard.items
    .map((item) => reviewItemFromWorkItem(item, { nowMs, lastSeenAt: options.lastSeenAt, staleAfterMs }))
    .filter((item): item is ReviewItem => Boolean(item))
    .sort(compareReviewItems);

  const recentlyCompleted = items
    .filter((item) => item.categories.includes("completed") || item.categories.includes("cancelled"))
    .sort(compareReviewItemsByActivity)
    .slice(0, itemLimit);
  const recentlyFailed = items
    .filter((item) => item.categories.includes("failed"))
    .sort(compareReviewItemsByActivity)
    .slice(0, itemLimit);
  const changedSinceLastSeen = items
    .filter((item) => item.sinceLastSeen)
    .sort(compareReviewItemsByActivity)
    .slice(0, itemLimit);
  const needsReview = items
    .filter((item) => item.categories.includes("needs-review"))
    .sort(compareReviewItemsByActivity)
    .slice(0, itemLimit);
  const stale = items
    .filter((item) => item.categories.includes("stale"))
    .sort(compareReviewItemsByActivity)
    .slice(0, itemLimit);

  return {
    items: items.slice(0, itemLimit),
    recentlyCompleted,
    recentlyFailed,
    changedSinceLastSeen,
    needsReview,
    stale,
    lastSeenAt: options.lastSeenAt,
    summary: {
      total: items.length,
      recentlyCompleted: recentlyCompleted.length,
      recentlyFailed: recentlyFailed.length,
      changedSinceLastSeen: changedSinceLastSeen.length,
      needsReview: needsReview.length,
      stale: stale.length,
      cancelled: items.filter((item) => item.categories.includes("cancelled")).length,
      delivered: items.filter((item) => item.delivered).length,
    },
  };
}

export function buildThreadSessionMapModel(
  snapshot: RuntimeSnapshot,
  timeline: TimelineEvent[],
  options: Pick<DashboardModelOptions, "nowMs" | "activeSessionStaleAfterMs"> = {},
): ThreadSessionMapModel {
  const nowMs = options.nowMs ?? Date.now();
  const activeSessionStaleAfterMs =
    options.activeSessionStaleAfterMs ?? DEFAULT_ACTIVE_SESSION_STALE_AFTER_MS;
  const agentsById = mapBy(snapshot.agents, (agent) => agent.id);
  const sessionsByKey = mapBy(snapshot.sessions, (session) => session.key);
  const sessionParentHints = buildSessionParentHints(timeline);
  const childSessionsByParent = new Map<string, SessionSummary[]>();
  const tasksBySession = new Map<string, TaskSummary[]>();
  const approvalsBySession = new Map<string, ApprovalSummary[]>();
  const metadataGaps = new Set<string>();

  for (const session of snapshot.sessions) {
    const parentKey = parentKeyForSession(session, sessionParentHints);
    if (!parentKey || parentKey === session.key) continue;
    const children = childSessionsByParent.get(parentKey) ?? [];
    children.push(session);
    childSessionsByParent.set(parentKey, children);
  }

  for (const task of snapshot.tasks) {
    if (!task.sessionKey) continue;
    const tasks = tasksBySession.get(task.sessionKey) ?? [];
    tasks.push(task);
    tasksBySession.set(task.sessionKey, tasks);
  }

  for (const approval of snapshot.approvals) {
    if (!approval.sessionKey) continue;
    const approvals = approvalsBySession.get(approval.sessionKey) ?? [];
    approvals.push(approval);
    approvalsBySession.set(approval.sessionKey, approvals);
  }

  const context = {
    agentsById,
    sessionsByKey,
    sessionParentHints,
    childSessionsByParent,
    tasksBySession,
    approvalsBySession,
    nowMs,
    activeSessionStaleAfterMs,
    metadataGaps,
  };

  const entries: ThreadSessionMapEntry[] = [];
  for (const session of snapshot.sessions) entries.push(threadSessionMapEntryForSession(session, context));

  for (const task of snapshot.tasks.filter((candidate) => !candidate.sessionKey || !sessionsByKey.has(candidate.sessionKey))) {
    entries.push(threadSessionMapEntryForOrphanedTask(task, context));
  }

  for (const approval of snapshot.approvals.filter(
    (candidate) => !candidate.sessionKey || !sessionsByKey.has(candidate.sessionKey),
  )) {
    entries.push(threadSessionMapEntryForOrphanedApproval(approval, context));
  }

  entries.sort(compareThreadSessionMapEntries);

  return {
    entries,
    summary: {
      total: entries.length,
      channels: entries.filter((entry) => entry.source.kind === "channel").length,
      threads: entries.filter((entry) => entry.source.kind === "thread").length,
      sessions: entries.filter((entry) => entry.source.kind === "session").length,
      orphanedTasks: entries.filter((entry) => entry.source.kind === "task").length,
      orphanedApprovals: entries.filter((entry) => entry.source.kind === "approval").length,
      partialLineage: entries.filter((entry) => entry.lineage.quality === "partial").length,
      missingLineage: entries.filter((entry) => entry.lineage.quality === "missing").length,
    },
    metadataGaps: [...metadataGaps].sort(),
  };
}

type ThreadSessionMapContext = {
  agentsById: Map<string, AgentSummary>;
  sessionsByKey: Map<string, SessionSummary>;
  sessionParentHints: Map<string, string>;
  childSessionsByParent: Map<string, SessionSummary[]>;
  tasksBySession: Map<string, TaskSummary[]>;
  approvalsBySession: Map<string, ApprovalSummary[]>;
  nowMs: number;
  activeSessionStaleAfterMs: number;
  metadataGaps: Set<string>;
};

function threadSessionMapEntryForSession(
  session: SessionSummary,
  context: ThreadSessionMapContext,
): ThreadSessionMapEntry {
  const source = sourceForSession(session, context.metadataGaps);
  const childSessions = sortByActivityDesc(context.childSessionsByParent.get(session.key) ?? []);
  const relatedSessions = [session, ...childSessions];
  const tasks = sortUniqueTasks([
    ...(context.tasksBySession.get(session.key) ?? []),
    ...childSessions.flatMap((child) => context.tasksBySession.get(child.key) ?? []),
  ]);
  const approvals = sortUniqueApprovals([
    ...(context.approvalsBySession.get(session.key) ?? []),
    ...childSessions.flatMap((child) => context.approvalsBySession.get(child.key) ?? []),
  ]);
  const agents = agentsForWorkItem({ sessions: relatedSessions, tasks, approvals }, context.agentsById);
  const parentKey = parentKeyForSession(session, context.sessionParentHints);
  const parentSession = parentKey ? context.sessionsByKey.get(parentKey) : undefined;
  const state = stateForThreadSessionMapEntry({ sessions: relatedSessions, tasks, approvals, source }, context);
  const primaryTask = primaryTaskForWorkItem(tasks);
  const primaryApproval = approvals.find((approval) => approval.status === "pending") ?? approvals[0];
  const primaryAgentId = session.agentId ?? primaryTask?.agentId ?? primaryApproval?.agentId ?? agents[0]?.id;
  const lineage = appendThreadSessionSourceDiagnostics(
    lineageForWorkItem({ sessions: relatedSessions, tasks, approvals }, context),
    source,
  );

  return {
    id: `session:${session.key}`,
    source,
    parentSession,
    childSessions,
    sessions: relatedSessions,
    tasks,
    runIds: runIdsFor({ sessions: relatedSessions, tasks }),
    approvals,
    agents,
    state,
    tone: toneForThreadSessionMapState(state),
    lineage,
    updatedAt: newestTimestamp([
      session.updatedAt ?? session.lastInteractionAt,
      ...childSessions.map((child) => child.updatedAt ?? child.lastInteractionAt),
      ...tasks.map((task) => task.endedAt ?? task.startedAt),
      ...approvals.map((approval) => approval.requestedAt),
    ]),
    links: {
      ...linksFor({
        agentId: primaryAgentId,
        sessionKey: session.key,
        taskId: primaryTask?.id,
        approvalId: primaryApproval?.status === "pending" ? primaryApproval.id : undefined,
      }),
      discord: source.permalink,
    },
  };
}

function threadSessionMapEntryForOrphanedTask(
  task: TaskSummary,
  context: ThreadSessionMapContext,
): ThreadSessionMapEntry {
  const agent = task.agentId ? context.agentsById.get(task.agentId) : undefined;
  const source = {
    kind: "task",
    key: task.id,
    label: task.title ?? task.id,
    metadataSource: "missing",
  } satisfies ThreadSessionMapSource;
  const lineage = lineageForWorkItem({ sessions: [], tasks: [task], approvals: [] }, context);
  const state = stateForThreadSessionMapEntry({ sessions: [], tasks: [task], approvals: [], source }, context);

  return {
    id: `task:${task.id}`,
    source,
    childSessions: [],
    sessions: [],
    tasks: [task],
    runIds: runIdsFor({ sessions: [], tasks: [task] }),
    approvals: [],
    agents: agent ? [agent] : [],
    state,
    tone: toneForThreadSessionMapState(state),
    lineage,
    updatedAt: task.endedAt ?? task.startedAt,
    links: linksFor({ agentId: task.agentId, sessionKey: task.sessionKey, taskId: task.id }),
  };
}

function threadSessionMapEntryForOrphanedApproval(
  approval: ApprovalSummary,
  context: ThreadSessionMapContext,
): ThreadSessionMapEntry {
  const agent = approval.agentId ? context.agentsById.get(approval.agentId) : undefined;
  const source = {
    kind: "approval",
    key: approval.id,
    label: approval.command ?? approval.id,
    metadataSource: "missing",
  } satisfies ThreadSessionMapSource;
  const lineage = lineageForWorkItem({ sessions: [], tasks: [], approvals: [approval] }, context);
  const state = stateForThreadSessionMapEntry({ sessions: [], tasks: [], approvals: [approval], source }, context);

  return {
    id: `approval:${approval.id}`,
    source,
    childSessions: [],
    sessions: [],
    tasks: [],
    runIds: [],
    approvals: [approval],
    agents: agent ? [agent] : [],
    state,
    tone: toneForThreadSessionMapState(state),
    lineage,
    updatedAt: approval.requestedAt,
    links: linksFor({ agentId: approval.agentId, sessionKey: approval.sessionKey, approvalId: approval.id }),
  };
}

function workItemFromSeed(
  seed: WorkItemSeed,
  context: {
    agentsById: Map<string, AgentSummary>;
    sessionsByKey: Map<string, SessionSummary>;
    sessionParentHints: Map<string, string>;
    nowMs: number;
  },
): WorkItem {
  const sessions = sortByActivityDesc(seed.sessions);
  const tasks = [...seed.tasks].sort(compareTasksByActivityDesc);
  const approvals = [...seed.approvals].sort(compareApprovalsByActivityDesc);
  const events = filterMeaningfulEvents(seed.events).sort(compareEventsDesc).slice(0, 6);
  const agents = agentsForWorkItem({ sessions, tasks, approvals }, context.agentsById);
  const state = stateForWorkItem({ sessions, tasks, approvals });
  const updatedAt = newestTimestamp([
    ...sessions.map((session) => session.updatedAt ?? session.lastInteractionAt),
    ...tasks.map((task) => task.endedAt ?? task.startedAt),
    ...approvals.map((approval) => approval.requestedAt),
    ...events.map((event) => event.timestamp),
  ]);
  const createdAt = oldestTimestamp([
    ...tasks.map((task) => task.startedAt ?? task.endedAt),
    ...approvals.map((approval) => approval.requestedAt),
    ...events.map((event) => event.timestamp),
    ...sessions.map((session) => session.updatedAt ?? session.lastInteractionAt),
  ]);
  const primarySession = seed.rootSession ?? sessions[0];
  const primaryTask = primaryTaskForWorkItem(tasks);
  const primaryApproval = approvals.find((approval) => approval.status === "pending") ?? approvals[0];
  const primaryAgentId = primarySession?.agentId ?? primaryTask?.agentId ?? primaryApproval?.agentId ?? agents[0]?.id;
  const primarySessionKey = primarySession?.key ?? primaryTask?.sessionKey ?? primaryApproval?.sessionKey;
  const links = linksFor({
    agentId: primaryAgentId,
    sessionKey: primarySessionKey,
    taskId: primaryTask?.id,
    approvalId: primaryApproval?.status === "pending" ? primaryApproval.id : undefined,
  });
  const lineage = lineageForWorkItem({ sessions, tasks, approvals }, context);

  return {
    id: seed.key,
    title: titleForWorkItem({ rootSession: seed.rootSession, sessions, tasks, approvals, events }),
    state,
    tone: toneForWorkItemState(state),
    summary: summaryForWorkItem({ state, sessions, tasks, approvals, events }),
    ageLabel: formatAge(createdAt ?? updatedAt, context.nowMs),
    createdAt,
    updatedAt,
    agentLabel: agents.map(labelForAgent).filter(Boolean).join(", ") || undefined,
    sessionLabel: primarySession ? labelForSession(primarySession) : undefined,
    currentAction: currentActionForWorkItem({ sessions, tasks, approvals }),
    lineage,
    deliveryRecovery: deliveryRecoveryForWorkItem({ state, sessions, tasks, events, lineage, links }),
    evidence: { agents, sessions, tasks, approvals, events },
    links,
    operatorActions: buildOperatorActions({
      links,
      agent: agents[0],
      session: primarySession,
      task: primaryTask,
      approval: primaryApproval,
    }),
  };
}

function reviewItemFromWorkItem(
  item: WorkItem,
  context: { nowMs: number; lastSeenAt?: string; staleAfterMs: number },
): ReviewItem | null {
  const task = primaryReviewTaskForWorkItem(item.evidence.tasks);
  const categories: ReviewItemKind[] = [];
  const terminalStatus = task?.status;

  if (item.state === "failed" || terminalStatus === "failed" || terminalStatus === "timed_out") categories.push("failed");
  if (terminalStatus === "cancelled") categories.push("cancelled");
  if (item.state === "done" || terminalStatus === "completed") categories.push("completed");
  if (item.state === "review") categories.push("needs-review");
  if (isStaleReviewWorkItem(item, context.nowMs, context.staleAfterMs)) categories.push("stale");

  const changedAt = newestTimestamp([
    item.updatedAt,
    ...item.evidence.tasks.map((candidate) => candidate.endedAt ?? candidate.startedAt),
    ...item.evidence.sessions.map((session) => session.updatedAt ?? session.lastInteractionAt),
    ...item.evidence.events.map((event) => event.timestamp),
  ]);
  const sinceLastSeen = isAfter(changedAt, context.lastSeenAt);
  if (sinceLastSeen) categories.push("changed");

  const uniqueCategories = dedupe(categories);
  if (uniqueCategories.length === 0) return null;

  const deliveryStatus = deliveryStatusForEvents(item.evidence.events);
  const delivered = deliveryStatus?.toLowerCase() === "delivered" || deliveryStatus?.toLowerCase() === "published";
  const completedAt = task?.endedAt ?? (item.state === "done" || item.state === "failed" ? item.updatedAt : undefined);
  const kind = primaryReviewKind(uniqueCategories);

  return {
    id: item.id,
    kind,
    categories: uniqueCategories,
    tone: toneForReviewItem(kind, item.tone),
    title: item.title,
    summary: reviewSummaryForWorkItem(item, task, deliveryStatus),
    status: task?.status ?? item.state,
    nextAction: nextActionForReviewItem(kind, deliveryStatus),
    ageLabel: formatAge(changedAt ?? completedAt ?? item.updatedAt ?? item.createdAt, context.nowMs),
    updatedAt: item.updatedAt,
    changedAt,
    completedAt,
    lastSeenAt: context.lastSeenAt,
    sinceLastSeen,
    delivered,
    deliveryStatus,
    deliveryRecovery: item.deliveryRecovery,
    agentLabel: item.agentLabel,
    sessionLabel: item.sessionLabel,
    links: item.links,
    workItem: item,
    task,
    events: item.evidence.events,
  } satisfies ReviewItem;
}

function primaryReviewTaskForWorkItem(tasks: TaskSummary[]): TaskSummary | undefined {
  return [...tasks].sort((a, b) => {
    const statusRank = rankReviewTaskStatus(a.status) - rankReviewTaskStatus(b.status);
    if (statusRank !== 0) return statusRank;
    return compareTasksByActivityDesc(a, b);
  })[0];
}

function rankReviewTaskStatus(status: TaskSummary["status"]): number {
  if (status === "failed" || status === "timed_out") return 0;
  if (status === "cancelled") return 1;
  if (status === "completed") return 2;
  if (status === "running") return 3;
  if (status === "queued") return 4;
  return 5;
}

function primaryReviewKind(categories: ReviewItemKind[]): ReviewItemKind {
  if (categories.includes("failed")) return "failed";
  if (categories.includes("stale")) return "stale";
  if (categories.includes("needs-review")) return "needs-review";
  if (categories.includes("cancelled")) return "cancelled";
  if (categories.includes("completed")) return "completed";
  return "changed";
}

function toneForReviewItem(kind: ReviewItemKind, fallback: AttentionTone | "ok"): AttentionTone | "ok" {
  if (kind === "failed") return "error";
  if (kind === "stale") return "warn";
  if (kind === "needs-review" || kind === "changed") return "info";
  return fallback === "error" || fallback === "warn" ? fallback : "ok";
}

function reviewSummaryForWorkItem(
  item: WorkItem,
  task: TaskSummary | undefined,
  deliveryStatus: string | undefined,
): string | undefined {
  if (task?.status === "failed" || task?.status === "timed_out") return task.error ?? item.summary ?? `${task.title ?? task.id} ${task.status}.`;
  if (task?.status === "cancelled") return item.summary ?? `${task.title ?? task.id} was cancelled.`;
  if (deliveryStatus) return item.summary ? `${item.summary} Delivery: ${deliveryStatus}.` : `Delivery: ${deliveryStatus}.`;
  return item.summary;
}

function nextActionForReviewItem(kind: ReviewItemKind, deliveryStatus: string | undefined): string {
  if (kind === "failed") return "Inspect the failure, recover or retry if appropriate, then archive when resolved.";
  if (kind === "stale") return "Check whether the session is still alive or needs intervention.";
  if (kind === "needs-review") return "Review the result and decide whether to continue, reopen, or archive.";
  if (kind === "changed") return "Review changes since last seen and follow up if needed.";
  if (kind === "cancelled") return "No action needed unless the cancellation was unexpected.";
  if (deliveryStatus && deliveryStatus.toLowerCase() !== "delivered" && deliveryStatus.toLowerCase() !== "published") {
    return "Confirm result delivery before archiving.";
  }
  return "Review the summary, then archive or dismiss if no follow-up is needed.";
}

function isStaleReviewWorkItem(item: WorkItem, nowMs: number, staleAfterMs: number): boolean {
  if (item.state !== "active" && item.state !== "waiting") return false;
  const timestamps = [
    item.updatedAt,
    ...item.evidence.sessions
      .filter((session) => session.isActive || session.currentRunId || normalizeWorkStatusText(session.status) === "running")
      .map((session) => session.updatedAt ?? session.lastInteractionAt),
  ];
  return timestamps.some((timestamp) => isOlderThan(timestamp, nowMs, staleAfterMs));
}

function deliveryStatusForEvents(events: TimelineEvent[]): string | undefined {
  for (const event of [...events].sort(compareEventsDesc)) {
    const direct = payloadString(event.payload, "deliveryStatus", "delivery", "deliveryState", "resultDeliveryStatus");
    if (direct) return direct;
    const delivered = payloadBoolean(event.payload, "delivered", "resultDelivered", "deliverySucceeded");
    if (delivered !== undefined) return delivered ? "delivered" : "failed";

    const text = `${event.title} ${event.summary ?? ""}`.toLowerCase();
    if (text.includes("delivery failed") || text.includes("failed delivery")) return "failed";
    if (text.includes("delivered") || text.includes("published")) return "delivered";
  }
  return undefined;
}

export function buildDeliveryRecoveryQueueModel(
  snapshot: RuntimeSnapshot,
  timeline: TimelineEvent[],
): DeliveryRecoveryQueueModel {
  const agentsById = mapBy(snapshot.agents, (agent) => agent.id);
  const sessionsByKey = mapBy(snapshot.sessions, (session) => session.key);
  const sessionParentHints = buildSessionParentHints(timeline);
  const items: DeliveryRecoveryQueueItem[] = [];

  for (const task of snapshot.tasks) {
    const session = task.sessionKey ? sessionsByKey.get(task.sessionKey) : undefined;
    const agentId = task.agentId ?? session?.agentId;
    const agent = agentId ? agentsById.get(agentId) : undefined;
    const events = relatedEventsForTask(timeline, task);
    const links = linksFor({ agentId, sessionKey: session?.key ?? task.sessionKey, taskId: task.id });
    const lineage = lineageForWorkItem(
      { sessions: session ? [session] : [], tasks: [task], approvals: [] },
      { agentsById, sessionsByKey, sessionParentHints },
    );
    const deliveryRecovery = deliveryRecoveryForWorkItem({
      state: stateForWorkItem({ sessions: session ? [session] : [], tasks: [task], approvals: [] }),
      sessions: session ? [session] : [],
      tasks: [task],
      events,
      lineage,
      links,
    });

    if (!shouldShowInDeliveryRecoveryQueue(deliveryRecovery, task)) continue;

    items.push({
      id: `task:${task.id}`,
      status: deliveryRecovery.status,
      tone: deliveryRecovery.tone,
      title: task.title ?? task.id,
      summary: deliveryRecovery.summary,
      nextAction: nextActionForDeliveryRecovery(deliveryRecovery),
      agent,
      session,
      task,
      events,
      links,
      deliveryRecovery,
      operatorActions: buildOperatorActions({ links, agent, session, task }),
    });
  }

  items.sort(compareDeliveryRecoveryQueueItems);
  return {
    items,
    summary: {
      total: items.length,
      delivered: items.filter((item) => item.status === "delivered").length,
      queued: items.filter((item) => item.status === "queued").length,
      failedDelivery: items.filter((item) => item.status === "failed-delivery").length,
      lostParent: items.filter((item) => item.status === "lost-parent").length,
      silentTerminal: items.filter((item) => item.status === "silent-terminal").length,
      unknown: items.filter((item) => item.status === "unknown").length,
    },
    metadataGaps: dedupe(items.flatMap((item) => item.deliveryRecovery.metadataGaps)).sort(),
  };
}

function shouldShowInDeliveryRecoveryQueue(deliveryRecovery: DeliveryRecoveryState, task: TaskSummary): boolean {
  if (deliveryRecovery.status === "delivered") return false;
  if (deliveryRecovery.needsRecovery) return true;
  if (deliveryRecovery.status === "queued") return true;
  return isTerminalTask(task) && deliveryRecovery.status === "unknown";
}

function nextActionForDeliveryRecovery(deliveryRecovery: DeliveryRecoveryState): string {
  if (deliveryRecovery.status === "failed-delivery") return "Use task and timeline evidence to manually recover the result; automatic resend is disabled.";
  if (deliveryRecovery.status === "lost-parent") return "Find the intended parent/session from lineage evidence, then manually recover the result if appropriate.";
  if (deliveryRecovery.status === "silent-terminal") return "Confirm whether a user-visible terminal summary exists before archiving.";
  if (deliveryRecovery.status === "queued") return "Watch for a delivery receipt or session wake before dismissing.";
  return "Inspect task/session/timeline evidence before deciding whether recovery is needed.";
}

function compareDeliveryRecoveryQueueItems(a: DeliveryRecoveryQueueItem, b: DeliveryRecoveryQueueItem): number {
  const statusRank = rankDeliveryRecoveryStatus(a.status) - rankDeliveryRecoveryStatus(b.status);
  if (statusRank !== 0) return statusRank;
  return parseTime(b.task.endedAt ?? b.task.startedAt) - parseTime(a.task.endedAt ?? a.task.startedAt);
}

function rankDeliveryRecoveryStatus(status: DeliveryRecoveryStatus): number {
  switch (status) {
    case "failed-delivery":
      return 0;
    case "lost-parent":
      return 1;
    case "queued":
      return 2;
    case "silent-terminal":
      return 3;
    case "unknown":
      return 4;
    case "delivered":
      return 5;
  }
}

function isTerminalTask(task: TaskSummary): boolean {
  return task.status === "completed" || task.status === "failed" || task.status === "timed_out" || task.status === "cancelled";
}

type DeliverySignal = {
  status?: string;
  known: boolean;
  inferred: boolean;
  resultVisible: boolean;
};

function deliverySignalForWorkItem(
  events: TimelineEvent[],
  task: TaskSummary | undefined,
  sessions: SessionSummary[],
): DeliverySignal {
  const structured = [task as unknown as Record<string, unknown> | undefined, ...sessions.map((session) => session as unknown as Record<string, unknown>)]
    .flatMap((raw) => raw ? [deliveryStatusFromRaw(raw)] : [])
    .find((status): status is string => Boolean(status));
  if (structured) return { status: structured, known: true, inferred: false, resultVisible: isDeliveredStatus(structured) || rawHasResultSummary(task) || sessions.some(rawHasResultSummary) };

  for (const event of [...events].sort(compareEventsDesc)) {
    const direct = payloadString(event.payload, "deliveryStatus", "delivery", "deliveryState", "resultDeliveryStatus");
    if (direct) return { status: direct, known: true, inferred: false, resultVisible: isDeliveredStatus(direct) || rawHasResultSummary(event.payload) };
    const delivered = payloadBoolean(event.payload, "delivered", "resultDelivered", "deliverySucceeded");
    if (delivered !== undefined) return { status: delivered ? "delivered" : "failed", known: true, inferred: false, resultVisible: delivered };

    const text = `${event.title} ${event.summary ?? ""}`.toLowerCase();
    if (text.includes("delivery failed") || text.includes("failed delivery")) return { status: "failed", known: false, inferred: true, resultVisible: false };
    if (text.includes("delivered") || text.includes("published") || text.includes("posted back")) return { status: "delivered", known: false, inferred: true, resultVisible: true };
    if (text.includes("queued for session wake") || text.includes("delivery queued") || text.includes("delivery pending")) return { status: "queued", known: false, inferred: true, resultVisible: false };
  }

  const taskText = `${task?.title ?? ""} ${task?.error ?? ""}`.toLowerCase();
  if (taskText.includes("delivery failed") || taskText.includes("failed delivery") || taskText.includes("result delivery failed")) {
    return { status: "failed", known: false, inferred: true, resultVisible: false };
  }
  if (taskText.includes("parent thread unavailable") || taskText.includes("parent session unavailable")) {
    return { status: "lost-parent", known: false, inferred: true, resultVisible: false };
  }

  return { known: false, inferred: false, resultVisible: rawHasResultSummary(task) || sessions.some(rawHasResultSummary) || events.some((event) => rawHasResultSummary(event.payload)) };
}

function deliveryStatusFromRaw(raw: Record<string, unknown>): string | undefined {
  return pickRawString(raw, "deliveryStatus", "delivery", "deliveryState", "resultDeliveryStatus", "resultDeliveryState");
}

function rawHasResultSummary(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return Boolean(pickRawString(raw as Record<string, unknown>, "resultSummary", "finalSummary", "userVisibleResult", "terminalSummary"));
}

function isDeliveredStatus(status: string): boolean {
  const normalized = status.toLowerCase().replace(/[ _]/g, "-");
  return normalized === "delivered" || normalized === "published" || normalized === "posted" || normalized === "sent";
}

function deliveryRecoveryForWorkItem(input: {
  state: WorkItemState;
  sessions: SessionSummary[];
  tasks: TaskSummary[];
  events: TimelineEvent[];
  lineage: WorkItemLineage;
  links: RuntimeLinks;
}): DeliveryRecoveryState {
  const signal = deliverySignalForWorkItem(input.events, primaryReviewTaskForWorkItem(input.tasks), input.sessions);
  const explicit = signal.status?.toLowerCase().replace(/[ _]/g, "-");
  const terminalTask = primaryReviewTaskForWorkItem(input.tasks);
  const terminal = Boolean(terminalTask && isTerminalTask(terminalTask));
  const eventText = input.events.map((event) => `${event.title} ${event.summary ?? ""}`).join(" ").toLowerCase();
  const taskText = `${terminalTask?.title ?? ""} ${terminalTask?.error ?? ""}`.toLowerCase();
  const text = `${eventText} ${taskText}`;
  const parentMissing =
    input.lineage.diagnostic?.toLowerCase().includes("parent session missing") ||
    input.lineage.diagnostic?.toLowerCase().includes("references missing session") ||
    text.includes("parent thread unavailable") ||
    text.includes("parent session unavailable") ||
    text.includes("parent thread missing") ||
    text.includes("parent session missing") ||
    input.sessions.some((session) => normalizeWorkStatusText(session.status) === "lost");

  const evidence = deliveryRecoveryEvidence(input.links, input.events, terminalTask, input.lineage);
  const disabledActions = disabledRecoveryActions();

  if (explicit && isDeliveredStatus(explicit)) {
    return {
      status: "delivered",
      label: "Result delivered",
      tone: "ok",
      summary: "Runtime evidence says the user-visible result was delivered or published.",
      known: signal.known,
      inferred: signal.inferred,
      resultVisible: signal.resultVisible,
      needsRecovery: false,
      metadataGaps: signal.inferred ? ["delivery receipt is inferred from timeline/task text because normalized delivery metadata is unavailable"] : [],
      evidence,
      disabledActions,
    };
  }

  if (explicit === "queued" || explicit === "pending" || explicit === "queued-for-session-wake") {
    return {
      status: "queued",
      label: "Delivery queued",
      tone: "warn",
      summary: "Result delivery appears queued or pending; verify it wakes the target session before archiving.",
      known: signal.known,
      inferred: signal.inferred,
      resultVisible: false,
      needsRecovery: true,
      metadataGaps: ["delivery completion not confirmed", "safe resend/reinject metadata missing"],
      evidence,
      disabledActions,
    };
  }

  if (explicit === "failed" || explicit === "delivery-failed" || explicit === "failed-delivery" || eventText.includes("delivery failed") || eventText.includes("failed delivery")) {
    return {
      status: "failed-delivery",
      label: "Delivery failed",
      tone: "error",
      summary: "A delivery failure signal is present. Use evidence links to manually recover; automatic resend/inject is intentionally disabled.",
      known: signal.known,
      inferred: signal.inferred || !signal.known,
      resultVisible: false,
      needsRecovery: true,
      metadataGaps: ["safe resend/reinject metadata missing"],
      evidence,
      disabledActions,
    };
  }

  if (explicit === "lost-parent" || (terminal && parentMissing)) {
    return {
      status: "lost-parent",
      label: "Parent missing",
      tone: "error",
      summary: "The task is terminal, but parent session/thread evidence is missing or lost, so delivery cannot be trusted.",
      known: false,
      inferred: true,
      resultVisible: false,
      needsRecovery: true,
      metadataGaps: ["parent session/thread delivery target missing"],
      evidence,
      disabledActions,
    };
  }

  if (terminal && !explicit) {
    return {
      status: "silent-terminal",
      label: "No delivery signal",
      tone: "warn",
      summary: "Task reached a terminal state without explicit delivered/queued/failed delivery metadata.",
      known: false,
      inferred: true,
      resultVisible: signal.resultVisible,
      needsRecovery: true,
      metadataGaps: ["terminal task has no delivery status metadata", "safe user-visible result body/receipt metadata missing"],
      evidence,
      disabledActions,
    };
  }

  return {
    status: "unknown",
    label: "Delivery not terminal",
    tone: "neutral",
    summary: input.state === "active" || input.state === "waiting" ? "Delivery is not expected until the work reaches a terminal state." : "No delivery metadata is available yet.",
    known: false,
    inferred: false,
    resultVisible: false,
    needsRecovery: false,
    metadataGaps: ["delivery status metadata unavailable"],
    evidence,
    disabledActions,
  };
}

function deliveryRecoveryEvidence(
  links: RuntimeLinks,
  events: TimelineEvent[],
  task: TaskSummary | undefined,
  lineage: WorkItemLineage,
): DeliveryRecoveryEvidence[] {
  const newestDeliveryEvent = [...events].sort(compareEventsDesc).find((event) => deliveryStatusForEvents([event]) || /deliver|publish|result/i.test(`${event.title} ${event.summary ?? ""}`));
  const evidence: Array<DeliveryRecoveryEvidence | undefined> = [
    links.task ? { label: "Task detail", href: links.task, detail: task?.status } : undefined,
    links.session ? { label: "Parent/session", href: links.session } : undefined,
    { label: "Timeline", href: links.timeline ?? "/timeline", detail: newestDeliveryEvent ? newestDeliveryEvent.title : "Filter by task/session/run" },
    lineage.diagnostic ? { label: "Lineage", detail: lineage.diagnostic } : undefined,
  ];
  return evidence.filter((item): item is DeliveryRecoveryEvidence => Boolean(item));
}

function disabledRecoveryActions(): DeliveryRecoveryAction[] {
  return [
    {
      label: "Resend result",
      disabledReason: "disabled until routing, permission, and idempotency metadata are explicit",
    },
    {
      label: "Inject into parent",
      disabledReason: "disabled to avoid posting hidden transcript/tool output into a user channel",
    },
    {
      label: "Copy result text",
      disabledReason: "disabled because the runtime model does not expose a safe user-visible result body separately from transcript/tool output",
    },
    {
      label: "Retry delivery",
      disabledReason: "disabled because no delivery retry RPC, target route, or idempotency key is declared",
    },
  ];
}

function controlCenterItemFromAttention(item: AttentionItem, lane: ControlCenterLane): ControlCenterItem {
  return {
    id: item.id,
    lane,
    tone: item.tone,
    title: item.title,
    summary: item.summary,
    status: item.kind,
    agentLabel: labelForAgent(item.agent),
    sessionLabel: labelForSession(item.session),
    nextAction: nextActionForAttention(item),
    updatedAt: item.timestamp,
    links: item.links,
    operatorActions: buildOperatorActions({
      links: item.links,
      agent: item.agent,
      session: item.session,
      task: item.task,
      approval: item.approval,
      includeGlobalLinks: false,
    }),
    agent: item.agent,
    session: item.session,
    task: item.task,
    approval: item.approval,
  };
}

function controlCenterItemFromTask(
  task: TaskSummary,
  lane: ControlCenterLane,
  agentsById: Map<string, AgentSummary>,
  sessionsByKey: Map<string, SessionSummary>,
): ControlCenterItem {
  const session = task.sessionKey ? sessionsByKey.get(task.sessionKey) : undefined;
  const agentId = task.agentId ?? session?.agentId;
  const agent = agentId ? agentsById.get(agentId) : undefined;
  const failed = task.status === "failed" || task.status === "timed_out";
  const links = linksFor({ agentId, sessionKey: session?.key ?? task.sessionKey, taskId: task.id });
  return {
    id: `task:${task.id}`,
    lane,
    tone: failed ? "error" : "ok",
    title: task.title ?? task.id,
    summary: failed ? task.error ?? `Task ${task.status}.` : undefined,
    status: task.status,
    agentLabel: labelForAgent(agent),
    sessionLabel: labelForSession(session),
    nextAction: failed ? "Open task details, inspect the error, and retry or recover if appropriate." : "No action needed; open details if context is useful.",
    startedAt: task.startedAt,
    updatedAt: task.endedAt ?? task.startedAt,
    completedAt: task.endedAt,
    links,
    operatorActions: buildOperatorActions({ links, agent, session, task }),
    agent,
    session,
    task,
  };
}

function nextActionForAttention(item: AttentionItem): string {
  switch (item.kind) {
    case "gateway":
    case "health":
    case "stale-snapshot":
    case "access":
      return "Verify gateway/access state before relying on the dashboard.";
    case "security-posture":
      return "Review security posture before allowing more privileged work.";
    case "lost-task":
    case "stale-active-session":
      return "Open the linked task/session and confirm whether work is still alive.";
    case "long-running-task":
      return "Check progress and decide whether to keep waiting or intervene.";
    case "approval":
      return "Approve or deny the pending request.";
    case "task-failed":
      return "Open task details, inspect the error, and retry or recover if appropriate.";
  }
}

export function buildApprovalCockpitModel(
  snapshot: RuntimeSnapshot,
  timeline: TimelineEvent[],
  options: Pick<DashboardModelOptions, "nowMs"> = {},
): ApprovalCockpitModel {
  const nowMs = options.nowMs ?? Date.now();
  const agentsById = mapBy(snapshot.agents, (agent) => agent.id);
  const sessionsByKey = mapBy(snapshot.sessions, (session) => session.key);
  const tasksById = mapBy(snapshot.tasks, (task) => task.id);
  const approvalsById = mapBy(snapshot.approvals, (approval) => approval.id);
  const items: ApprovalCockpitItem[] = snapshot.approvals.map((approval) =>
    approvalCockpitItemFromApproval(approval, snapshot, timeline, {
      nowMs,
      agentsById,
      sessionsByKey,
    }),
  );

  for (const event of approvalSyncEvents(timeline, approvalsById, tasksById)) {
    items.push(approvalCockpitItemFromSyncEvent(event, snapshot, { agentsById, sessionsByKey }));
  }

  if (hasFullModeCosmeticWarning(snapshot.health?.raw)) {
    items.push(fullModeApprovalWarningItem(snapshot));
  }

  items.sort(compareApprovalCockpitItems);

  const summary = emptyApprovalCockpitSummary();
  for (const item of items) summary[item.status] += 1;

  return {
    items,
    summary,
    metadataGaps: dedupe(items.flatMap((item) => item.metadataGaps)).sort(),
  };
}

function approvalCockpitItemFromApproval(
  approval: ApprovalSummary,
  snapshot: RuntimeSnapshot,
  timeline: TimelineEvent[],
  context: {
    nowMs: number;
    agentsById: Map<string, AgentSummary>;
    sessionsByKey: Map<string, SessionSummary>;
  },
): ApprovalCockpitItem {
  const raw = approval as unknown as Record<string, unknown>;
  const session = approval.sessionKey ? context.sessionsByKey.get(approval.sessionKey) : undefined;
  const agentId = approval.agentId ?? session?.agentId;
  const agent = agentId ? context.agentsById.get(agentId) : undefined;
  const relatedTasks = tasksForApproval(snapshot.tasks, approval, session);
  const task = relatedTasks[0];
  const links = linksFor({ agentId, sessionKey: session?.key ?? approval.sessionKey, taskId: task?.id, approvalId: approval.id });
  const state = approvalCockpitStatusForApproval(approval, context.nowMs);
  const risk = riskForCommand(approval.command, approval.kind);
  const host = pickRawString(raw, "host", "execHost", "hostname");
  const cwd = pickRawString(raw, "cwd", "workingDirectory", "currentWorkingDirectory");
  const expiresAt = pickRawString(raw, "expiresAt", "expires_at", "deadlineAt");
  const timeoutMs = pickRawNumber(raw, "timeoutMs", "timeout_ms", "approvalTimeoutMs");
  const resolvedAt = pickRawString(raw, "resolvedAt", "resolved_at");
  const consumedAt = pickRawString(raw, "consumedAt", "consumed_at", "usedAt");
  const decisionScope = pickRawString(raw, "scope", "decisionScope", "mode") ?? (approval.status === "pending" ? "allow-once" : undefined);
  const failureReason = pickRawString(raw, "reason", "failure", "failureReason", "error", "resolutionError");
  const metadataGaps = approvalMetadataGaps({ approval, host, cwd, expiresAt, timeoutMs, state, snapshot });
  const syncHints = approvalSyncHints(approval, state, relatedApprovalEvents(timeline, approval), failureReason);
  const statusTitle = titleForApprovalCockpitApproval(approval, state, decisionScope);

  return {
    id: `approval:${approval.id}`,
    kind: approval.kind,
    status: state,
    title: statusTitle,
    statusLabel: labelForApprovalCockpitStatus(state),
    tone: toneForApprovalCockpitStatus(state, risk.level),
    command: approval.command ?? "[command unavailable]",
    cwd,
    host,
    decisionScope,
    expiresAt,
    resolvedAt,
    consumedAt,
    failureReason,
    commandRiskSignals: risk.signals,
    origin: {
      agentId,
      sessionKey: session?.key ?? approval.sessionKey,
      taskId: task?.id,
      runId: task?.runId ?? session?.currentRunId,
    },
    requestedAt: approval.requestedAt,
    timeout: timeoutLabel(timeoutMs, approval.requestedAt, expiresAt),
    riskSummary: risk.summary,
    policyLayers: approvalPolicyLayers(snapshot, approval, session, agent, { host, decisionScope }),
    syncHints,
    metadataGaps,
    evidence: approvalEvidence(links, approval, session, task, timeline),
    disabledActions: disabledApprovalCockpitActions(state),
    links,
    approval,
  };
}

function approvalCockpitItemFromSyncEvent(
  event: TimelineEvent,
  snapshot: RuntimeSnapshot,
  context: { agentsById: Map<string, AgentSummary>; sessionsByKey: Map<string, SessionSummary> },
): ApprovalCockpitItem {
  const approvalId = approvalIdFromEvent(event) ?? event.id;
  const session = event.sessionKey ? context.sessionsByKey.get(event.sessionKey) : undefined;
  const agentId = event.agentId ?? session?.agentId;
  const task = event.taskId ? snapshot.tasks.find((candidate) => candidate.id === event.taskId) : undefined;
  const links = linksFor({ agentId, sessionKey: session?.key ?? event.sessionKey, taskId: task?.id, approvalId });
  const command = payloadString(event.payload, "command", "cmd", "script") ?? "[command unavailable]";
  const text = `${event.title} ${event.summary ?? ""} ${payloadString(event.payload, "error", "reason", "failureReason") ?? ""}`;
  const status: ApprovalCockpitStatus = /unknown|not found|missing|rotat/i.test(text) ? "unknown-id" : "sync-issue";
  const risk = riskForCommand(command === "[command unavailable]" ? undefined : command, "exec");
  const failureReason = payloadString(event.payload, "error", "reason", "failureReason") ?? event.summary;
  const metadataGaps = [
    "approval event references an id that is not present in the current approval snapshot",
    "fresh approval action metadata and audit outcome are unavailable",
  ];
  if (command === "[command unavailable]") metadataGaps.push("exact command text is unavailable for this sync event");
  const evidence = ([
    links.task ? { label: "Task detail", href: links.task, detail: task?.status, source: "task" } : undefined,
    links.session ? { label: "Session", href: links.session, source: "session" } : undefined,
    { label: "Timeline", href: links.timeline ?? "/timeline", detail: event.title, source: "timeline" },
  ] satisfies Array<DeliveryRecoveryEvidence | undefined>).flatMap((item) => (item ? [item] : []));

  return {
    id: `approval-sync:${approvalId}:${event.id}`,
    kind: "unknown",
    status,
    title: status === "unknown-id" ? "Unknown approval id" : "Approval sync issue",
    statusLabel: labelForApprovalCockpitStatus(status),
    tone: "error",
    command,
    commandRiskSignals: risk.signals,
    origin: { agentId, sessionKey: session?.key ?? event.sessionKey, taskId: task?.id, runId: event.runId ?? task?.runId },
    requestedAt: event.timestamp,
    failureReason,
    timeout: undefined,
    riskSummary: risk.summary,
    policyLayers: approvalPolicyLayers(snapshot, undefined, session, agentId ? context.agentsById.get(agentId) : undefined, {}),
    syncHints: ["Approval id is out of sync with the current snapshot; refresh before treating this as an agent/tool failure."],
    metadataGaps,
    evidence,
    disabledActions: disabledApprovalCockpitActions(status),
    links,
  };
}

function fullModeApprovalWarningItem(snapshot: RuntimeSnapshot): ApprovalCockpitItem {
  const metadataGaps = [
    "full-mode/tool-policy metadata is reported only as gateway health text, not as normalized approval policy layers",
    "host-local approval file state and exact ask fallback are not exposed in RuntimeSnapshot",
  ];
  return {
    id: "approval-warning:full-mode",
    kind: "exec",
    status: "full-mode-warning",
    title: "Full mode does not bypass host exec approvals",
    statusLabel: labelForApprovalCockpitStatus("full-mode-warning"),
    tone: "info",
    command: "[not a command request]",
    commandRiskSignals: [],
    origin: {},
    requestedAt: snapshot.updatedAt,
    riskSummary: "No command is pending; this warning explains why full/auto tool mode can still show exec approvals.",
    policyLayers: approvalPolicyLayers(snapshot, undefined, undefined, undefined, {}),
    syncHints: ["Full mode is a tool-policy posture; host-local exec approval prompts can still appear and must be handled separately."],
    metadataGaps,
    evidence: [{ label: "Gateway health", href: "/timeline", detail: "full-mode/tool-policy warning", source: "metadata" }],
    disabledActions: disabledApprovalCockpitActions("full-mode-warning"),
    links: { timeline: "/timeline" },
  };
}

function approvalCockpitStatusForApproval(approval: ApprovalSummary, nowMs: number): ApprovalCockpitStatus {
  const raw = approval as unknown as Record<string, unknown>;
  const status = typeof raw.status === "string" ? raw.status : approval.status;
  const expiresAt = pickRawString(raw, "expiresAt", "expires_at", "deadlineAt");
  const consumedAt = pickRawString(raw, "consumedAt", "consumed_at", "usedAt");
  if (status === "consumed" || consumedAt) return "consumed";
  if (status === "expired" || (status === "pending" && isBefore(expiresAt, nowMs))) return "expired";
  if (status === "approved" || status === "denied") return "resolved";
  if (status === "pending") return "pending";
  return "unknown";
}

function approvalSyncEvents(
  timeline: TimelineEvent[],
  approvalsById: Map<string, ApprovalSummary>,
  tasksById: Map<string, TaskSummary>,
): TimelineEvent[] {
  return timeline.filter((event) => {
    const approvalId = approvalIdFromEvent(event);
    const text = `${event.kind} ${event.title} ${event.summary ?? ""} ${payloadString(event.payload, "error", "reason", "failureReason") ?? ""}`;
    const approvalRelated = /approval/i.test(text) || event.kind === "approval.requested" || event.kind === "approval.resolved";
    if (!approvalRelated) return false;
    if (approvalId && !approvalsById.has(approvalId)) return /unknown|not found|missing|rotat|stale|expired|not consumed|sync/i.test(text);
    if (approvalId && approvalsById.has(approvalId)) return /not consumed|sync|stale approval|control ui/i.test(text);
    if (event.taskId && tasksById.has(event.taskId)) return /approval.*(unknown|not found|not consumed|sync|expired)/i.test(text);
    return false;
  });
}

function relatedApprovalEvents(timeline: TimelineEvent[], approval: ApprovalSummary): TimelineEvent[] {
  return timeline.filter((event) => approvalIdFromEvent(event) === approval.id || (approval.sessionKey && event.sessionKey === approval.sessionKey && /approval/i.test(`${event.title} ${event.summary ?? ""}`)));
}

function approvalIdFromEvent(event: TimelineEvent): string | undefined {
  return payloadString(event.payload, "approvalId", "approvalID", "id") ?? (event.id.startsWith("approval:") ? event.id.slice("approval:".length) : undefined);
}

function tasksForApproval(tasks: TaskSummary[], approval: ApprovalSummary, session: SessionSummary | undefined): TaskSummary[] {
  return tasks
    .filter((task) => {
      if (approval.sessionKey && task.sessionKey === approval.sessionKey) return true;
      if (session?.currentRunId && task.runId === session.currentRunId) return true;
      if (approval.agentId && task.agentId === approval.agentId && (task.status === "running" || task.status === "queued")) return true;
      return false;
    })
    .sort(compareTasksByActivityDesc);
}

function riskForCommand(command: string | undefined, kind: ApprovalSummary["kind"]): { level: OperatorActionRisk; summary: string; signals: string[] } {
  const signals: string[] = [];
  const text = command ?? "";
  if (kind === "plugin") signals.push("plugin approval can execute non-exec side effects");
  if (/\n/.test(text)) signals.push("multiline shell text");
  if (/(&&|\|\||;)/.test(text)) signals.push("chained shell operators");
  if (/\|/.test(text)) signals.push("pipe operator");
  if (/\b(sudo|su|chmod|chown|iptables|ufw|systemctl|service|mount|umount|mkfs|dd|curl|wget|nc|netcat)\b/i.test(text)) signals.push("privileged or network-capable command");
  if (/\brm\s+(-[^\s]*[rf]|[^\s]*\*)/i.test(text)) signals.push("destructive remove pattern");
  if (/\|\s*(sh|bash)\b/i.test(text)) signals.push("piped shell interpreter");
  if (/>\s*\/(etc|usr|bin|sbin|boot|var)\b/i.test(text)) signals.push("redirects into system path");
  if (!command) signals.push("exact command text missing");
  const level: OperatorActionRisk = signals.some((signal) => /destructive|privileged|piped shell|system path|plugin/.test(signal)) ? "high" : signals.length > 0 ? "medium" : "none";
  return {
    level,
    signals,
    summary: signals.length > 0 ? signals.join("; ") : "No high-risk shell patterns detected by the frontend selector.",
  };
}

function approvalPolicyLayers(
  snapshot: RuntimeSnapshot,
  approval: ApprovalSummary | undefined,
  session: SessionSummary | undefined,
  agent: AgentSummary | undefined,
  input: { host?: string; decisionScope?: string },
): string[] {
  const raw = snapshot.health?.raw;
  const toolPolicy = recursiveRawString(raw, "tools.exec", "toolsExec", "execPolicy", "toolPolicy", "execMode", "mode");
  const askFallback = recursiveRawString(raw, "ask", "askFallback", "approvalAsk", "execAsk") ?? pickRawString((approval as unknown as Record<string, unknown> | undefined) ?? {}, "ask", "askFallback");
  return [
    toolPolicy
      ? `Tool policy: ${toolPolicy}.`
      : "Tool policy: not normalized in RuntimeSnapshot; infer only from approval presence and gateway health.",
    input.host
      ? `Host approval policy: host-local approval is associated with ${input.host}.`
      : "Host approval policy: host/cwd approval file state is not exposed by the runtime snapshot.",
    askFallback
      ? `Ask fallback: ${askFallback}.`
      : "Ask fallback: not exposed; cannot prove whether ask came from tools.exec, host policy, or fallback.",
    session
      ? `Session override: linked to ${shortSessionKey(session.key)}${session.currentRunId ? ` / ${session.currentRunId}` : ""}; no normalized per-session approval override is exposed.`
      : "Session override: no linked session metadata, so per-session override state is unknown.",
    agent
      ? `Agent override: linked to ${agent.name ?? agent.id}; no normalized per-agent approval override is exposed.`
      : "Agent override: no linked agent metadata, so per-agent approval override state is unknown.",
    input.decisionScope ? `Decision scope: ${input.decisionScope}.` : "Decision scope: not exposed; do not assume durable allowlist semantics.",
  ];
}

function approvalMetadataGaps(input: {
  approval: ApprovalSummary;
  host?: string;
  cwd?: string;
  expiresAt?: string;
  timeoutMs?: number;
  state: ApprovalCockpitStatus;
  snapshot: RuntimeSnapshot;
}): string[] {
  const gaps: string[] = ["approve/deny/allowlist mutation disabled until backend exposes explicit action metadata, confirmation copy, freshness, destination, and audit outcome semantics"];
  if (!input.approval.command) gaps.push("exact command text missing from approval snapshot");
  if (!input.host) gaps.push("host metadata missing from approval snapshot");
  if (!input.cwd) gaps.push("cwd metadata missing from approval snapshot");
  if (!input.expiresAt && input.timeoutMs === undefined && input.state === "pending") gaps.push("timeout/deadline metadata missing for pending approval");
  if (!input.approval.sessionKey) gaps.push("session origin missing from approval snapshot");
  if (!input.approval.agentId) gaps.push("agent origin missing from approval snapshot");
  if (!input.snapshot.health?.raw) gaps.push("gateway health does not expose policy-layer metadata");
  return gaps;
}

function approvalSyncHints(
  approval: ApprovalSummary,
  state: ApprovalCockpitStatus,
  events: TimelineEvent[],
  failureReason: string | undefined,
): string[] {
  const hints: string[] = [];
  if (state === "expired") hints.push("This approval deadline has passed; a visible pending prompt may be stale and should be re-requested by the agent.");
  if (state === "consumed") hints.push("Approval was resolved and consumed; if the command still appears blocked, the control UI and host-local approval state may be out of sync.");
  if (state === "resolved") hints.push("Approval has a terminal decision; no read-only cockpit action will replay it.");
  if (failureReason) hints.push(`Failure/reason: ${failureReason}`);
  if (events.some((event) => /not consumed|sync|stale|unknown|not found/i.test(`${event.title} ${event.summary ?? ""}`))) {
    hints.push("Timeline contains an approval sync warning for this id.");
  }
  if (approval.status === "pending") hints.push("Use the exact command text below; chained operators, pipes, and multiline shell content are not hidden.");
  return hints;
}

function approvalEvidence(
  links: RuntimeLinks,
  approval: ApprovalSummary,
  session: SessionSummary | undefined,
  task: TaskSummary | undefined,
  timeline: TimelineEvent[],
): DeliveryRecoveryEvidence[] {
  const newestEvent = relatedApprovalEvents(timeline, approval).sort(compareEventsDesc)[0];
  const evidence = ([
    { label: "Approval queue", href: links.approval ?? "/approvals", detail: approval.id, source: "metadata" },
    links.task ? { label: "Task detail", href: links.task, detail: task?.status, source: "task" } : undefined,
    links.session ? { label: "Session", href: links.session, detail: session?.status, source: "session" } : undefined,
    { label: "Timeline", href: links.timeline ?? "/timeline", detail: newestEvent?.title ?? "Filter by approval/session/task", source: "timeline" },
  ] satisfies Array<DeliveryRecoveryEvidence | undefined>).flatMap((item) => (item ? [item] : []));
  return evidence;
}

function disabledApprovalCockpitActions(status: ApprovalCockpitStatus): ApprovalCockpitActionState[] {
  const baseReason = "disabled in read-only cockpit until backend action metadata, confirmation semantics, freshness, destination, and audit outcome are explicit";
  if (status === "pending" || status === "expired") {
    return [
      { label: "Approve once", disabledReason: baseReason },
      { label: "Deny", disabledReason: baseReason },
      { label: "Add durable allowlist", disabledReason: "disabled because durable scope/host/cwd matching semantics are not normalized" },
    ];
  }
  return [{ label: "Replay or mutate approval", disabledReason: "disabled because this cockpit is read-only and resolved/sync-warning items are evidence only" }];
}

function labelForApprovalCockpitStatus(status: ApprovalCockpitStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "resolved":
      return "Resolved";
    case "expired":
      return "Expired";
    case "consumed":
      return "Consumed";
    case "unknown-id":
      return "Unknown approval id";
    case "sync-issue":
      return "Sync issue";
    case "full-mode-warning":
      return "Full-mode warning";
    case "unknown":
      return "Unknown";
  }
}

function titleForApprovalCockpitApproval(
  approval: ApprovalSummary,
  state: ApprovalCockpitStatus,
  decisionScope: string | undefined,
): string {
  if (state === "pending" && /once|allow-once/i.test(decisionScope ?? "")) return "Allow-once approval pending";
  if (state === "pending") return approval.kind === "exec" ? "Execution approval pending" : "Plugin approval pending";
  if (state === "expired") return "Approval expired";
  if (state === "consumed") return "Approval consumed";
  if (state === "resolved") return `Approval ${approval.status}`;
  return "Approval state unknown";
}

function toneForApprovalCockpitStatus(status: ApprovalCockpitStatus, risk: OperatorActionRisk): AttentionTone | "ok" {
  if (status === "unknown-id" || status === "sync-issue") return "error";
  if (status === "expired") return "warn";
  if (status === "pending") return risk === "high" ? "error" : "warn";
  if (status === "full-mode-warning") return "info";
  return "ok";
}

function timeoutLabel(timeoutMs: number | undefined, requestedAt: string | undefined, expiresAt: string | undefined): string | undefined {
  if (timeoutMs !== undefined) return `${Math.round(timeoutMs / 1000)}s`;
  if (requestedAt && expiresAt) {
    const durationMs = parseTime(expiresAt) - parseTime(requestedAt);
    if (Number.isFinite(durationMs) && durationMs > 0) return `${Math.round(durationMs / 1000)}s`;
  }
  return undefined;
}

function isBefore(timestamp: string | undefined, nowMs: number): boolean {
  if (!timestamp) return false;
  const parsed = parseTime(timestamp);
  return Number.isFinite(parsed) && parsed < nowMs;
}

function pickRawNumber(raw: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function recursiveRawString(raw: unknown, ...keys: string[]): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const targets = new Set(keys.map((key) => key.toLowerCase()));
  const stack: Array<{ value: unknown; path: string }> = [{ value: raw, path: "" }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !current.value || typeof current.value !== "object") continue;
    for (const [key, value] of Object.entries(current.value as Record<string, unknown>)) {
      const path = current.path ? `${current.path}.${key}` : key;
      if ((targets.has(key.toLowerCase()) || targets.has(path.toLowerCase())) && (typeof value === "string" || typeof value === "boolean" || typeof value === "number")) {
        return String(value);
      }
      if (value && typeof value === "object") stack.push({ value, path });
    }
  }
  return undefined;
}

function hasFullModeCosmeticWarning(raw: Record<string, unknown> | undefined): boolean {
  if (!raw) return false;
  return walkPosture(raw, (key, candidate) => {
    const normalized = key.toLowerCase();
    if (!/(mode|policy|approval|exec|tool)/.test(normalized)) return false;
    return candidate === "full" || candidate === "full-mode" || candidate === "auto" || candidate === "never";
  });
}

function emptyApprovalCockpitSummary(): Record<ApprovalCockpitStatus, number> {
  return {
    pending: 0,
    resolved: 0,
    expired: 0,
    consumed: 0,
    "unknown-id": 0,
    "sync-issue": 0,
    "full-mode-warning": 0,
    unknown: 0,
  };
}

function compareApprovalCockpitItems(a: ApprovalCockpitItem, b: ApprovalCockpitItem): number {
  const statusRank = rankApprovalCockpitStatus(a.status) - rankApprovalCockpitStatus(b.status);
  if (statusRank !== 0) return statusRank;
  const riskRank = rankControlCenterTone(a.tone) - rankControlCenterTone(b.tone);
  if (riskRank !== 0) return riskRank;
  return parseTime(b.requestedAt ?? b.resolvedAt ?? b.consumedAt) - parseTime(a.requestedAt ?? a.resolvedAt ?? a.consumedAt);
}

function rankApprovalCockpitStatus(status: ApprovalCockpitStatus): number {
  switch (status) {
    case "unknown-id":
      return 0;
    case "sync-issue":
      return 1;
    case "pending":
      return 2;
    case "expired":
      return 3;
    case "full-mode-warning":
      return 4;
    case "consumed":
      return 5;
    case "resolved":
      return 6;
    case "unknown":
      return 7;
  }
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
    const links = linksFor({ agentId, sessionKey: session?.key ?? task.sessionKey, taskId: task.id });
    const lineage = lineageForWorkItem(
      { sessions: session ? [session] : [], tasks: [task], approvals: [] },
      { agentsById, sessionsByKey, sessionParentHints },
    );

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
      links,
      deliveryRecovery: deliveryRecoveryForWorkItem({
        state: stateForWorkItem({ sessions: session ? [session] : [], tasks: [task], approvals: [] }),
        sessions: session ? [session] : [],
        tasks: [task],
        events: relatedEventsForTask(timeline, task),
        lineage,
        links,
      }),
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
  const links = linksFor({ agentId: task.agentId, sessionKey: task.sessionKey, taskId: task.id });
  const events = relatedEventsForTask(timeline, task);
  const sessionsByKey = mapBy(snapshot.sessions, (candidate) => candidate.key);
  const agentsById = mapBy(snapshot.agents, (candidate) => candidate.id);
  const lineage = lineageForWorkItem(
    { sessions: session ? [session] : [], tasks: [task], approvals: [] },
    { agentsById, sessionsByKey, sessionParentHints: buildSessionParentHints(timeline) },
  );

  return {
    task,
    agent,
    session,
    events,
    links,
    deliveryRecovery: deliveryRecoveryForWorkItem({
      state: stateForWorkItem({ sessions: session ? [session] : [], tasks: [task], approvals: [] }),
      sessions: session ? [session] : [],
      tasks: [task],
      events,
      lineage,
      links,
    }),
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

export function buildOperatorActions(input: {
  links: RuntimeLinks;
  agent?: AgentSummary;
  session?: SessionSummary;
  task?: TaskSummary;
  approval?: ApprovalSummary;
  includeGlobalLinks?: boolean;
}): OperatorAction[] {
  const actions: OperatorAction[] = input.includeGlobalLinks === false ? [] : [
    navigationAction("open-work-board", "Open work board", "/work", "Missing work board route metadata."),
    navigationAction("open-graph", "Open graph", "/graph", "Missing graph route metadata."),
  ];

  actions.push(
    navigationAction("open-agent", "Open agent", input.links.agent, "Missing agent id metadata for this item."),
    navigationAction(
      "open-session",
      "Open session",
      input.links.session,
      input.session?.key || input.task?.sessionKey || input.approval?.sessionKey
        ? "Missing agent id metadata required to build the session route."
        : "Missing session key metadata for this item.",
    ),
    navigationAction("open-task", "Open task", input.links.task, "Missing task id metadata for this item."),
    navigationAction("open-approval", "Open approval queue", input.links.approval, "No pending approval id is associated with this item."),
    navigationAction("open-timeline", "Open timeline", input.links.timeline, "Missing timeline route metadata."),
  );

  const sessionKey = input.session?.key ?? input.task?.sessionKey ?? input.approval?.sessionKey;
  if (sessionKey) {
    actions.push(disabledRpcAction(
      "steer-session",
      "Steer session",
      "steering",
      "medium",
      "sessions.steer",
      { key: sessionKey },
      "sessions.steer is declared, but the dashboard lacks safe steering payload and confirmation metadata.",
    ));
    actions.push(disabledRpcAction(
      "abort-session",
      "Abort session",
      "steering",
      "medium",
      "sessions.abort",
      { key: sessionKey },
      "sessions.abort is declared, but Control Center needs explicit abort policy and confirmation copy before exposing it.",
    ));
  } else if (input.task?.status === "running" || input.task?.status === "queued" || input.approval?.status === "pending") {
    actions.push(disabledMissingAction("steer-session", "Steer session", "steering", "medium", "Missing session key metadata."));
    actions.push(disabledMissingAction("abort-session", "Abort session", "steering", "medium", "Missing session key metadata."));
  }

  if (input.task?.status === "running" || input.task?.status === "queued") {
    actions.push(disabledRpcAction(
      "cancel-task",
      "Cancel task",
      "steering",
      "medium",
      "tasks.cancel",
      { id: input.task.id },
      "tasks.cancel is declared, but Control Center needs cancellation policy and confirmation metadata before exposing it.",
    ));
  }

  if (input.task?.status === "failed" || input.task?.status === "timed_out") {
    actions.push(disabledMissingAction(
      "retry-task",
      "Retry / recover task",
      "recovery",
      "medium",
      "No retry/recover RPC or idempotency metadata is declared for failed tasks.",
    ));
  }

  if (input.approval?.status === "pending") {
    const method = input.approval.kind === "plugin" ? "plugin.approval.resolve" : "exec.approval.resolve";
    const risk = isHighRiskApproval(input.approval) ? "high" : "medium";
    const disabledReason = "Approval resolution RPC exists, but Control Center routes to the approval queue until command risk and confirmation metadata are shown inline.";
    actions.push(disabledRpcAction("approve-approval", "Approve request", "approval", risk, method, { id: input.approval.id, decision: "approved" }, disabledReason));
    actions.push(disabledRpcAction("deny-approval", "Deny request", "approval", risk, method, { id: input.approval.id, decision: "denied" }, disabledReason));
  }

  return actions;
}

function navigationAction(id: OperatorActionId, label: string, href: string | undefined, disabledReason: string): OperatorAction {
  return href
    ? { id, label, kind: "navigation", enabled: true, risk: "none", source: "runtime-link", href }
    : { id, label, kind: "navigation", enabled: false, risk: "none", source: "missing-metadata", disabledReason };
}

function disabledRpcAction(
  id: OperatorActionId,
  label: string,
  kind: OperatorActionKind,
  risk: OperatorActionRisk,
  rpcMethod: string,
  rpcParams: Record<string, string>,
  disabledReason: string,
): OperatorAction {
  return {
    id,
    label,
    kind,
    enabled: false,
    risk,
    source: "declared-rpc",
    rpcMethod,
    rpcParams,
    requiresConfirmation: true,
    disabledReason,
  };
}

function disabledMissingAction(
  id: OperatorActionId,
  label: string,
  kind: OperatorActionKind,
  risk: OperatorActionRisk,
  disabledReason: string,
): OperatorAction {
  return {
    id,
    label,
    kind,
    enabled: false,
    risk,
    source: "missing-metadata",
    requiresConfirmation: risk !== "none",
    disabledReason,
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

  return items
    .map((item) => ({
      ...item,
      operatorActions: buildOperatorActions({
        links: item.links,
        agent: item.agent,
        session: item.session,
        task: item.task,
        approval: item.approval,
      }),
    }))
    .sort(compareAttention);
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

function findWorkRootSession(
  session: SessionSummary,
  sessionsByKey: Map<string, SessionSummary>,
  sessionParentHints: Map<string, string>,
): SessionSummary {
  let current = session;
  const seen = new Set<string>();

  while (!seen.has(current.key)) {
    seen.add(current.key);
    if (isDiscordThreadSessionKey(current.key)) return current;

    const parentKey = parentKeyForSession(current, sessionParentHints);
    const parent = parentKey ? sessionsByKey.get(parentKey) : undefined;
    if (!parent || parent.key === current.key) return current;
    current = parent;
  }

  return session;
}

function parentKeyForSession(session: SessionSummary, sessionParentHints: Map<string, string>): string | undefined {
  return session.parentSessionKey ?? session.spawnedBy ?? session.ownerSessionKey ?? sessionParentHints.get(session.key);
}

function sourceForSession(session: SessionSummary, metadataGaps: Set<string>): ThreadSessionMapSource {
  const raw = session as unknown as Record<string, unknown>;
  const keySource = sourceFromSessionKey(session.key);
  const rawPlatform = pickRawString(raw, "platform");
  const rawChannelId = pickRawString(raw, "channelId");
  const rawChannelName = pickRawString(raw, "channelName");
  const rawThreadId = pickRawString(raw, "threadId");
  const rawThreadName = pickRawString(raw, "threadName");
  const permalink = pickRawString(raw, "permalink", "url", "discordUrl");
  const archived = pickRawBoolean(raw, "archived", "archivedOrHidden", "hidden");
  const kind = keySource.kind ?? (rawThreadId ? "thread" : rawChannelId ? "channel" : "session");
  const metadataSource = rawPlatform || rawChannelId || rawChannelName || rawThreadId || rawThreadName || permalink || archived !== undefined ? "raw" : keySource.key ? "key" : "missing";

  if ((kind === "channel" || kind === "thread") && metadataSource === "key") {
    metadataGaps.add(
      "Discord source metadata is inferred from session keys because channel/thread ids, archive state, and permalinks are not normalized in RuntimeSnapshot.",
    );
  }

  return {
    kind,
    key: session.key,
    label: sourceLabelForSession(session, kind, rawChannelName, rawThreadName),
    platform: rawPlatform ?? (kind === "channel" || kind === "thread" ? "discord" : undefined),
    channelId: rawChannelId ?? keySource.channelId,
    channelName: rawChannelName,
    threadId: rawThreadId ?? keySource.threadId,
    threadName: rawThreadName ?? (kind === "thread" ? stripThreadLabel(session.label) ?? keySource.threadId : undefined),
    permalink,
    archived,
    metadataSource,
  };
}

function sourceFromSessionKey(key: string): {
  kind?: Extract<ThreadSessionMapSourceKind, "channel" | "thread">;
  key?: string;
  channelId?: string;
  threadId?: string;
} {
  const channelMarker = ":discord:channel:";
  const threadMarker = ":discord:thread:";
  const channelIndex = key.indexOf(channelMarker);
  if (channelIndex >= 0) {
    return { kind: "channel", key, channelId: key.slice(channelIndex + channelMarker.length) || undefined };
  }
  const threadIndex = key.indexOf(threadMarker);
  if (threadIndex >= 0) {
    return { kind: "thread", key, threadId: key.slice(threadIndex + threadMarker.length) || undefined };
  }
  return {};
}

function sourceLabelForSession(
  session: SessionSummary,
  kind: ThreadSessionMapSourceKind,
  channelName?: string,
  threadName?: string,
): string {
  if (kind === "channel" && channelName) return `#${channelName}`;
  if (kind === "thread" && threadName) return threadName;
  if (kind === "thread") return stripThreadLabel(session.label) ?? shortSessionKey(session.key);
  return session.label ?? shortSessionKey(session.key);
}

function stripThreadLabel(label: string | undefined): string | undefined {
  return label?.replace(/^thread:\s*/i, "");
}

function pickRawString(raw: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function pickRawBoolean(raw: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function appendThreadSessionSourceDiagnostics(
  lineage: WorkItemLineage,
  source: ThreadSessionMapSource,
): WorkItemLineage {
  if ((source.kind !== "channel" && source.kind !== "thread") || source.metadataSource !== "key") return lineage;
  const diagnostic = "Discord source binding is inferred from the session key; normalized channel/thread metadata and permalink are unavailable.";
  if (lineage.quality === "complete") return { quality: "partial", diagnostic: `Lineage incomplete: ${diagnostic}` };
  return {
    quality: lineage.quality,
    diagnostic: lineage.diagnostic ? `${lineage.diagnostic} ${diagnostic}` : diagnostic,
  };
}

function stateForThreadSessionMapEntry(
  input: {
    sessions: SessionSummary[];
    tasks: TaskSummary[];
    approvals: ApprovalSummary[];
    source: ThreadSessionMapSource;
  },
  context: Pick<ThreadSessionMapContext, "nowMs" | "activeSessionStaleAfterMs">,
): ThreadSessionMapState {
  if (
    input.tasks.some((task) => task.status === "failed" || task.status === "timed_out") ||
    input.sessions.some((session) => normalizeWorkStatusText(session.status) === "failed" || normalizeWorkStatusText(session.status) === "lost")
  ) {
    return "failed";
  }
  if (input.approvals.some((approval) => approval.status === "pending")) return "waiting";
  if (
    input.sessions.some(
      (session) =>
        Boolean(session.isActive || session.currentRunId) &&
        isOlderThan(session.updatedAt ?? session.lastInteractionAt, context.nowMs, context.activeSessionStaleAfterMs),
    )
  ) {
    return "stale";
  }
  if (
    input.tasks.some((task) => task.status === "running") ||
    input.sessions.some((session) => session.isActive || session.currentRunId || normalizeWorkStatusText(session.status) === "running")
  ) {
    return "active";
  }
  if (input.tasks.some((task) => task.status === "queued") || input.sessions.some((session) => normalizeWorkStatusText(session.status) === "queued")) return "queued";
  if (input.source.archived || input.sessions.some((session) => normalizeThreadMapStatusText(session.status) === "archived")) return "archived";
  if (input.tasks.some((task) => task.status === "completed") || input.sessions.some((session) => normalizeWorkStatusText(session.status) === "completed")) return "completed";
  return "unknown";
}

function normalizeThreadMapStatusText(status: string | undefined): "archived" | undefined {
  if (!status) return undefined;
  const normalized = status.toLowerCase().replace(/[ -]/g, "_");
  if (normalized === "archived" || normalized === "hidden" || normalized === "archived_or_hidden") return "archived";
  return undefined;
}

function toneForThreadSessionMapState(state: ThreadSessionMapState): AttentionTone | "ok" {
  if (state === "failed") return "error";
  if (state === "waiting" || state === "queued" || state === "stale") return "warn";
  if (state === "archived" || state === "unknown") return "info";
  return "ok";
}

function runIdsFor(input: { sessions: SessionSummary[]; tasks: TaskSummary[] }): string[] {
  return dedupe([...input.sessions.map((session) => session.currentRunId), ...input.tasks.map((task) => task.runId)]).sort();
}

function sortUniqueTasks(tasks: TaskSummary[]): TaskSummary[] {
  const byId = new Map<string, TaskSummary>();
  for (const task of tasks) byId.set(task.id, task);
  return [...byId.values()].sort(compareTasksByActivityDesc);
}

function sortUniqueApprovals(approvals: ApprovalSummary[]): ApprovalSummary[] {
  const byId = new Map<string, ApprovalSummary>();
  for (const approval of approvals) byId.set(approval.id, approval);
  return [...byId.values()].sort(compareApprovalsByActivityDesc);
}

function compareThreadSessionMapEntries(a: ThreadSessionMapEntry, b: ThreadSessionMapEntry): number {
  const stateRank = rankThreadSessionMapState(a.state) - rankThreadSessionMapState(b.state);
  if (stateRank !== 0) return stateRank;
  const sourceRank = rankThreadSessionSourceKind(a.source.kind) - rankThreadSessionSourceKind(b.source.kind);
  if (sourceRank !== 0) return sourceRank;
  const timeRank = parseTime(b.updatedAt) - parseTime(a.updatedAt);
  if (timeRank !== 0) return timeRank;
  return a.source.label.localeCompare(b.source.label);
}

function rankThreadSessionMapState(state: ThreadSessionMapState): number {
  switch (state) {
    case "waiting":
      return 0;
    case "failed":
      return 1;
    case "stale":
      return 2;
    case "active":
      return 3;
    case "queued":
      return 4;
    case "unknown":
      return 5;
    case "completed":
      return 6;
    case "archived":
      return 7;
  }
}

function rankThreadSessionSourceKind(kind: ThreadSessionMapSourceKind): number {
  if (kind === "thread") return 0;
  if (kind === "channel") return 1;
  if (kind === "session") return 2;
  if (kind === "task") return 3;
  return 4;
}

function stateForWorkItem(input: {
  sessions: SessionSummary[];
  tasks: TaskSummary[];
  approvals: ApprovalSummary[];
}): WorkItemState {
  if (input.tasks.some((task) => task.status === "failed" || task.status === "timed_out")) return "failed";
  if (input.approvals.some((approval) => approval.status === "pending")) return "waiting";
  if (input.sessions.some(hasReviewStatus)) return "review";
  if (
    input.tasks.some((task) => task.status === "running") ||
    input.sessions.some((session) => session.isActive || session.currentRunId || normalizeWorkStatusText(session.status) === "running") ||
    input.tasks.some((task) => task.status === "queued" && Boolean(task.startedAt))
  ) {
    return "active";
  }
  if (input.tasks.some((task) => task.status === "queued") || input.sessions.some((session) => normalizeWorkStatusText(session.status) === "queued")) {
    return "inbox";
  }
  if (input.tasks.some((task) => task.status === "completed" || task.status === "cancelled") || input.sessions.some((session) => normalizeWorkStatusText(session.status) === "completed")) {
    return "done";
  }
  return "inbox";
}

function toneForWorkItemState(state: WorkItemState): WorkItem["tone"] {
  if (state === "failed") return "error";
  if (state === "waiting") return "warn";
  if (state === "inbox" || state === "review") return "info";
  return "ok";
}

function titleForWorkItem(input: {
  rootSession?: SessionSummary;
  sessions: SessionSummary[];
  tasks: TaskSummary[];
  approvals: ApprovalSummary[];
  events: TimelineEvent[];
}): string {
  const label = input.rootSession?.label ?? input.sessions[0]?.label;
  if (label) return label.replace(/^thread:\s*/i, "");
  const task = primaryTaskForWorkItem(input.tasks);
  if (task?.title) return task.title;
  const approval = input.approvals[0];
  if (approval) return approval.kind === "exec" ? "Execution approval" : "Plugin approval";
  return input.events[0]?.title ?? input.rootSession?.key ?? "Untitled work item";
}

function summaryForWorkItem(input: {
  state: WorkItemState;
  sessions: SessionSummary[];
  tasks: TaskSummary[];
  approvals: ApprovalSummary[];
  events: TimelineEvent[];
}): string | undefined {
  const failedTask = input.tasks.find((task) => task.status === "failed" || task.status === "timed_out");
  if (failedTask) return failedTask.error ?? `${failedTask.title ?? failedTask.id} ${failedTask.status}.`;

  const approval = input.approvals.find((candidate) => candidate.status === "pending");
  if (approval) return approval.command ?? `${approval.kind} approval pending.`;

  const sessionWithTool = input.sessions.find((session) => session.currentTool);
  if (sessionWithTool?.currentTool) return `Current tool: ${sessionWithTool.currentTool}`;

  const newestEvent = input.events[0];
  if (newestEvent) return newestEvent.summary ?? newestEvent.title;

  const task = primaryTaskForWorkItem(input.tasks);
  if (task?.title && input.state !== "done") return task.title;
  if (input.state === "done" && task?.title) return `${task.title} ${task.status === "cancelled" ? "cancelled" : "completed"}.`;
  return undefined;
}

function currentActionForWorkItem(input: {
  sessions: SessionSummary[];
  tasks: TaskSummary[];
  approvals: ApprovalSummary[];
}): string | undefined {
  const approval = input.approvals.find((candidate) => candidate.status === "pending");
  if (approval) return approval.command;
  const sessionWithTool = input.sessions.find((session) => session.currentTool);
  if (sessionWithTool?.currentTool) return sessionWithTool.currentTool;
  return primaryTaskForWorkItem(input.tasks)?.status;
}

function lineageForWorkItem(
  input: { sessions: SessionSummary[]; tasks: TaskSummary[]; approvals: ApprovalSummary[] },
  context: {
    agentsById: Map<string, AgentSummary>;
    sessionsByKey: Map<string, SessionSummary>;
    sessionParentHints: Map<string, string>;
  },
): WorkItemLineage {
  const diagnostics: string[] = [];

  for (const session of input.sessions) {
    const parentKey = parentKeyForSession(session, context.sessionParentHints);
    if (parentKey && !context.sessionsByKey.has(parentKey)) diagnostics.push(`parent session missing for ${shortSessionKey(session.key)}`);
    if (session.agentId && !context.agentsById.has(session.agentId)) diagnostics.push(`agent missing for ${shortSessionKey(session.key)}`);
  }

  for (const task of input.tasks) {
    if (task.sessionKey && !context.sessionsByKey.has(task.sessionKey)) diagnostics.push(`task ${task.id} references missing session`);
    if (!task.sessionKey && !task.agentId) diagnostics.push(`task ${task.id} has no session or agent`);
    if (task.agentId && !context.agentsById.has(task.agentId)) diagnostics.push(`task ${task.id} references missing agent`);
  }

  for (const approval of input.approvals) {
    if (approval.sessionKey && !context.sessionsByKey.has(approval.sessionKey)) diagnostics.push(`approval ${approval.id} references missing session`);
    if (!approval.sessionKey && !approval.agentId) diagnostics.push(`approval ${approval.id} has no session or agent`);
    if (approval.agentId && !context.agentsById.has(approval.agentId)) diagnostics.push(`approval ${approval.id} references missing agent`);
  }

  const hasRuntimeEvidence = input.sessions.length > 0 || input.tasks.some((task) => task.agentId || task.sessionKey);
  if (!hasRuntimeEvidence) {
    return {
      quality: "missing",
      diagnostic: diagnostics.length > 0 ? `Lineage missing: ${dedupe(diagnostics).join("; ")}.` : "Lineage missing: no session or agent evidence is available.",
    };
  }

  if (diagnostics.length > 0) {
    return { quality: "partial", diagnostic: `Lineage incomplete: ${dedupe(diagnostics).join("; ")}.` };
  }

  return { quality: "complete" };
}

function agentsForWorkItem(
  input: { sessions: SessionSummary[]; tasks: TaskSummary[]; approvals: ApprovalSummary[] },
  agentsById: Map<string, AgentSummary>,
): AgentSummary[] {
  const ids = dedupe([
    ...input.sessions.map((session) => session.agentId),
    ...input.tasks.map((task) => task.agentId),
    ...input.approvals.map((approval) => approval.agentId),
  ]);
  return ids.flatMap((id) => (id ? [agentsById.get(id)].filter((agent): agent is AgentSummary => Boolean(agent)) : []));
}

function primaryTaskForWorkItem(tasks: TaskSummary[]): TaskSummary | undefined {
  return [...tasks].sort((a, b) => {
    const statusRank = rankWorkItemTaskStatus(a.status) - rankWorkItemTaskStatus(b.status);
    if (statusRank !== 0) return statusRank;
    return compareTasksByActivityDesc(a, b);
  })[0];
}

function compareWorkItems(a: WorkItem, b: WorkItem): number {
  const stateRank = rankWorkItemState(a.state) - rankWorkItemState(b.state);
  if (stateRank !== 0) return stateRank;
  const toneRank = rankControlCenterTone(a.tone) - rankControlCenterTone(b.tone);
  if (toneRank !== 0) return toneRank;
  return parseTime(b.updatedAt ?? b.createdAt) - parseTime(a.updatedAt ?? a.createdAt);
}

function rankWorkItemState(state: WorkItemState): number {
  switch (state) {
    case "waiting":
      return 0;
    case "failed":
      return 1;
    case "active":
      return 2;
    case "review":
      return 3;
    case "inbox":
      return 4;
    case "done":
      return 5;
  }
}

function rankWorkItemTaskStatus(status: TaskSummary["status"]): number {
  if (status === "failed" || status === "timed_out") return 0;
  if (status === "running") return 1;
  if (status === "queued") return 2;
  if (status === "completed") return 3;
  return 4;
}

function compareTasksByActivityDesc(a: TaskSummary, b: TaskSummary): number {
  return parseTime(b.endedAt ?? b.startedAt) - parseTime(a.endedAt ?? a.startedAt);
}

function compareApprovalsByActivityDesc(a: ApprovalSummary, b: ApprovalSummary): number {
  return parseTime(b.requestedAt) - parseTime(a.requestedAt);
}

function emptyWorkBoardSummary(): Record<WorkItemState, number> {
  return { inbox: 0, active: 0, waiting: 0, review: 0, done: 0, failed: 0 };
}

function hasReviewStatus(session: SessionSummary): boolean {
  const normalized = session.status?.toLowerCase().replace(/[ -]/g, "_") ?? "";
  return normalized === "review" || normalized === "needs_review" || normalized === "needs_human" || normalized === "paused";
}

function hasSessionWorkSignal(session: SessionSummary): boolean {
  return Boolean(session.isActive || session.currentRunId || session.currentTool || session.status);
}

function isDiscordThreadSessionKey(key: string): boolean {
  return key.includes(":discord:thread:");
}

function pushUnique<T>(items: T[], item: T, key: (item: T) => string): void {
  const itemKey = key(item);
  if (!items.some((candidate) => key(candidate) === itemKey)) items.push(item);
}

function dedupe<T>(values: Array<T | undefined>): T[] {
  return [...new Set(values.filter((value): value is T => value !== undefined))];
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

function payloadBoolean(payload: Record<string, unknown> | undefined, ...keys: string[]): boolean | undefined {
  if (!payload) return undefined;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "boolean") return value;
  }
  const parent = payload.parent;
  if (parent && typeof parent === "object") {
    for (const key of keys) {
      const value = (parent as Record<string, unknown>)[key];
      if (typeof value === "boolean") return value;
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

function compareReviewItems(a: ReviewItem, b: ReviewItem): number {
  const kindRank = rankReviewKind(a.kind) - rankReviewKind(b.kind);
  if (kindRank !== 0) return kindRank;
  return compareReviewItemsByActivity(a, b);
}

function compareReviewItemsByActivity(a: ReviewItem, b: ReviewItem): number {
  return parseTime(b.changedAt ?? b.completedAt ?? b.updatedAt) - parseTime(a.changedAt ?? a.completedAt ?? a.updatedAt);
}

function rankReviewKind(kind: ReviewItemKind): number {
  switch (kind) {
    case "failed":
      return 0;
    case "stale":
      return 1;
    case "needs-review":
      return 2;
    case "changed":
      return 3;
    case "cancelled":
      return 4;
    case "completed":
      return 5;
  }
}

function compareControlCenterItems(a: ControlCenterItem, b: ControlCenterItem): number {
  const toneRank = rankControlCenterTone(a.tone) - rankControlCenterTone(b.tone);
  if (toneRank !== 0) return toneRank;
  return parseTime(b.updatedAt ?? b.completedAt ?? b.startedAt) - parseTime(a.updatedAt ?? a.completedAt ?? a.startedAt);
}

function rankControlCenterTone(tone: ControlCenterItem["tone"]): number {
  if (tone === "error") return 0;
  if (tone === "warn") return 1;
  if (tone === "info") return 2;
  return 3;
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

function labelForAgent(agent: AgentSummary | undefined): string | undefined {
  return agent?.name ?? agent?.id;
}

function labelForSession(session: SessionSummary | undefined): string | undefined {
  return session ? session.label ?? shortSessionKey(session.key) : undefined;
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

function isAfter(iso: string | undefined, baselineIso: string | undefined): boolean {
  const ms = parseTime(iso);
  const baselineMs = parseTime(baselineIso);
  return ms > 0 && baselineMs > 0 && ms > baselineMs;
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

function oldestTimestamp(values: Array<string | undefined>): string | undefined {
  const oldest = values
    .map((value) => ({ value, ms: parseTime(value) }))
    .filter((item): item is { value: string; ms: number } => Boolean(item.value) && item.ms > 0)
    .sort((a, b) => a.ms - b.ms)[0];
  return oldest?.value;
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
