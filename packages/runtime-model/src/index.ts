/** Normalized runtime types for Dashclaw Agent OS */

import { RUNTIME_LIMITS } from "./limits.js";

export { RUNTIME_LIMITS } from "./limits.js";

export type GatewayConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export type TaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export type TimelineEventKind =
  | "agent.lifecycle"
  | "agent.assistant"
  | "agent.tool"
  | "session.message"
  | "session.operation"
  | "session.tool"
  | "sessions.changed"
  | "cron"
  | "health"
  | "presence"
  | "heartbeat"
  | "approval.requested"
  | "approval.resolved"
  | "admin.action"
  | "gateway.connected"
  | "gateway.disconnected"
  | "gateway.shutdown"
  | "chat";

export interface GatewayHealth {
  ok: boolean;
  uptimeMs?: number;
  version?: string;
  degraded?: boolean;
  raw?: Record<string, unknown>;
}

export interface AgentSummary {
  id: string;
  name?: string;
  model?: string;
  runtime?: string;
  runtimeSource?: string;
  thinkingDefault?: string;
  workspace?: string;
}

export interface ContextBudgetSummary {
  schemaVersion?: number;
  source?: string;
  updatedAt?: string;
  provider?: string;
  model?: string;
  route?: string;
  shouldCompact?: boolean;
  estimatedPromptTokens?: number;
  contextTokenBudget?: number;
  promptBudgetBeforeReserve?: number;
  reserveTokens?: number;
  effectiveReserveTokens?: number;
  remainingPromptBudgetTokens?: number;
  overflowTokens?: number;
  toolResultReducibleChars?: number;
  messageCount?: number;
  unwindowedMessageCount?: number;
  sessionId?: string;
  /** Legacy compatibility aliases retained for older Gateway payloads. */
  status?: string;
  reason?: string;
  budgetTokens?: number;
  remainingTokens?: number;
  usedPercent?: number;
}

export interface CompactionCheckpointSummary {
  checkpointId?: string;
  createdAt?: string;
  timestamp?: string;
  reason?: string;
  tokensBefore?: number;
  tokensAfter?: number;
}

export interface DeliveryContextSummary {
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string;
}

export interface SessionOriginSummary {
  provider?: string;
  surface?: string;
  chatType?: string;
  accountId?: string;
  nativeChannelId?: string;
  channelId?: string;
  threadId?: string;
}

export interface SessionWorktreeSummary {
  id?: string;
  path?: string;
  branch?: string;
  repoRoot?: string;
}

export interface SessionSummary {
  key: string;
  sessionId?: string;
  kind?: string;
  agentId?: string;
  parentSessionKey?: string;
  spawnedBy?: string;
  ownerSessionKey?: string;
  spawnDepth?: number;
  subagentRole?: string;
  subagentControlScope?: string;
  forkedFromParent?: boolean;
  label?: string;
  model?: string;
  modelProvider?: string;
  agentRuntime?: string;
  agentRuntimeSource?: string;
  startedAt?: string;
  endedAt?: string;
  runtimeMs?: number;
  updatedAt?: string;
  lastInteractionAt?: string;
  status?: string;
  isActive?: boolean;
  hasActiveRun?: boolean;
  hasActiveSubagentRun?: boolean;
  subagentRunState?: string;
  abortedLastRun?: boolean;
  currentRunId?: string;
  currentTool?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  contextTokens?: number;
  estimatedCostUsd?: number;
  contextBudgetStatus?: ContextBudgetSummary;
  compactionCheckpointCount?: number;
  latestCompactionCheckpoint?: CompactionCheckpointSummary;
  /** Legacy snapshot compatibility. New Gateway rows use latestCompactionCheckpoint. */
  compactionCheckpoint?: CompactionCheckpointSummary;
  deliveryContext?: DeliveryContextSummary;
  origin?: SessionOriginSummary;
  spawnedWorkspaceDir?: string;
  spawnedCwd?: string;
  worktree?: SessionWorktreeSummary;
}

export interface TaskRuntimeSummary {
  id?: string;
  source?: string;
  startedAt?: string;
  endedAt?: string;
  runtimeMs?: number;
}

export interface TaskSummary {
  id: string;
  status: TaskStatus;
  kind?: string;
  title?: string;
  agentId?: string;
  sessionKey?: string;
  runId?: string;
  ownerKey?: string;
  childSessionKey?: string;
  sourceId?: string;
  flowId?: string;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  endedAt?: string;
  runtime?: TaskRuntimeSummary;
  progressSummary?: string;
  terminalSummary?: string;
  error?: string;
  errorCode?: string;
  errorKind?: string;
}

export interface CronJobSummary {
  id: string;
  name?: string;
  enabled: boolean;
  schedule?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastStatus?: string;
}

export interface ApprovalSummary {
  id: string;
  kind: "exec" | "plugin";
  status: "pending" | "approved" | "denied" | "expired" | "consumed";
  command?: string;
  sessionKey?: string;
  agentId?: string;
  requestedAt?: string;
  resolvedAt?: string;
  consumedAt?: string;
  expiresAt?: string;
  timeoutMs?: number;
  host?: string;
  cwd?: string;
  scope?: string;
  decision?: string;
  failureReason?: string;
  error?: string;
}

export interface NodeSummary {
  id: string;
  label?: string;
  connected: boolean;
  platform?: string;
}

export type SessionDiscoveryIncompleteReason =
  | "page-error"
  | "page-cap"
  | "row-cap"
  | "invalid-next-offset"
  | "inconsistent-page";

export interface SessionDiscoveryStatus {
  state: "complete" | "incomplete";
  degraded: boolean;
  pagesFetched: number;
  rowsFetched: number;
  uniqueSessionsFetched: number;
  publishedSessions: number;
  expectedTotal?: number;
  nextOffset?: number;
  reason?: SessionDiscoveryIncompleteReason;
  retainedLastComplete?: boolean;
  message?: string;
}

export interface RuntimeDiscoveryStatus {
  sessions: SessionDiscoveryStatus;
}

export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  timestamp: string;
  title: string;
  summary?: string;
  agentId?: string;
  sessionKey?: string;
  runId?: string;
  taskId?: string;
  severity?: "info" | "warn" | "error";
  payload?: Record<string, unknown>;
}

export interface RuntimeSnapshot {
  gatewayId: string;
  connectionState: GatewayConnectionState;
  health: GatewayHealth | null;
  agents: AgentSummary[];
  sessions: SessionSummary[];
  tasks: TaskSummary[];
  cronJobs: CronJobSummary[];
  approvals: ApprovalSummary[];
  nodes: NodeSummary[];
  activeRunCount: number;
  pendingApprovalCount: number;
  failedTaskCount: number;
  discovery?: RuntimeDiscoveryStatus;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  method: string;
  paramsSummary: string;
  success: boolean;
  error?: string;
  resultSummary?: string;
}

export interface AdminRpcRequest {
  method: string;
  params?: Record<string, unknown>;
  confirmToken?: string;
}

export type SafeOutputValue =
  | null
  | boolean
  | number
  | string
  | SafeOutputValue[]
  | { [key: string]: SafeOutputValue };

export interface SafeOutputOptions {
  maxDepth?: number;
  maxObjectKeys?: number;
  maxArrayItems?: number;
  maxStringLength?: number;
  maxTotalNodes?: number;
}

export interface PublicError {
  error: string;
  code: string;
}

export const REDACTED = "[REDACTED]";
export const TRUNCATED = "[TRUNCATED]";

const DEFAULT_SAFE_OUTPUT_OPTIONS: Required<SafeOutputOptions> = {
  maxDepth: 8,
  maxObjectKeys: 50,
  maxArrayItems: 50,
  maxStringLength: 10_000,
  maxTotalNodes: 1_000,
};

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SENSITIVE_KEYS = new Set([
  "authorization",
  "proxyauthorization",
  "cookie",
  "cookies",
  "setcookie",
  "setcookies",
  "credential",
  "credentials",
  "privatekey",
  "privatekeydata",
  "privatekeypem",
  "accesskey",
  "accesskeyid",
  "awsaccesskey",
  "awsaccesskeyid",
  "secretkey",
  "secretaccesskey",
  "awssecretkey",
  "awssecretaccesskey",
  "apikey",
  "password",
  "passwd",
  "passphrase",
  "sessiontoken",
  "awssessiontoken",
  "securitytoken",
  "awssecuritytoken",
  "gatewaytoken",
  "dashboardtoken",
  "authtoken",
  "bearertoken",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "clientsecret",
  "signingkey",
]);

const SENSITIVE_KEY_PATTERN =
  String.raw`(?:proxy[-_.\s]*authorization|authorization(?:[-_.\s]*header)?|set[-_.\s]*cookies?|cookies?|credentials?|private[-_.\s]*key(?:[-_.\s]*(?:data|pem))?|(?:aws[-_.\s]*)?access[-_.\s]*key(?:[-_.\s]*id)?|(?:aws[-_.\s]*)?secret[-_.\s]*(?:access[-_.\s]*)?key|api[-_.\s]*key|pass(?:word|wd|phrase)|(?:aws[-_.\s]*)?(?:session|security)[-_.\s]*token|(?:gateway|dashboard|auth|bearer|access|refresh|id)[-_.\s]*token|(?:client|webhook|shared|signing)[-_.\s]*secret|signing[-_.\s]*key|token|secret)`;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (SENSITIVE_KEYS.has(normalized)) return true;
  return (
    normalized.startsWith("authorization") ||
    normalized.endsWith("authorization") ||
    normalized.startsWith("cookie") ||
    normalized.endsWith("cookie") ||
    normalized.endsWith("cookies") ||
    normalized.endsWith("credential") ||
    normalized.endsWith("credentials") ||
    normalized.endsWith("password") ||
    normalized.includes("privatekey") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("secretkey") ||
    normalized.endsWith("sessiontoken") ||
    normalized.endsWith("apikey")
  );
}

function redactString(input: string, maxLength: number): string {
  const truncated = input.length > maxLength;
  let value = input.slice(0, maxLength);

  value = value.replace(
    /(\b[a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s/]+)@/gi,
    `$1$2:${REDACTED}@`,
  );
  value = value.replace(
    /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?(?:-----END(?: [A-Z0-9]+)* PRIVATE KEY-----|$)/gi,
    REDACTED,
  );
  value = value.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`);
  value = value.replace(
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
    REDACTED,
  );
  value = value.replace(
    /(\b(?:set[-_.\s]*cookies?|cookies?)\b\s*:\s*)[^\r\n"']+/gi,
    `$1${REDACTED}`,
  );

  const quotedAssignment = new RegExp(
    String.raw`((?:["'])?\b${SENSITIVE_KEY_PATTERN}\b(?:["'])?\s*[:=]\s*)(["'])(.*?)\2`,
    "gi",
  );
  value = value.replace(quotedAssignment, (_match, prefix: string, quote: string) => {
    return `${prefix}${quote}${REDACTED}${quote}`;
  });

  const unquotedAssignment = new RegExp(
    String.raw`((?:["'])?\b${SENSITIVE_KEY_PATTERN}\b(?:["'])?\s*[:=]\s*)(?!\[REDACTED\])([^\s,;&"']+)`,
    "gi",
  );
  value = value.replace(unquotedAssignment, `$1${REDACTED}`);

  return truncated ? `${value}…${TRUNCATED}` : value;
}

export function safeOutputValue(value: unknown, options: SafeOutputOptions = {}): SafeOutputValue {
  const limits = { ...DEFAULT_SAFE_OUTPUT_OPTIONS, ...options };
  const seen = new WeakSet<object>();
  let nodes = 0;

  const visit = (current: unknown, depth: number): SafeOutputValue => {
    nodes += 1;
    if (nodes > limits.maxTotalNodes) return TRUNCATED;
    if (current === null || current === undefined) return null;
    if (typeof current === "string") return redactString(current, limits.maxStringLength);
    if (typeof current === "boolean") return current;
    if (typeof current === "number") return Number.isFinite(current) ? current : String(current);
    if (typeof current === "bigint") return current.toString();
    if (typeof current === "symbol" || typeof current === "function") return "[UNSUPPORTED]";
    if (typeof current !== "object") return String(current);
    if (depth >= limits.maxDepth) return TRUNCATED;
    if (seen.has(current)) return "[CIRCULAR]";
    seen.add(current);

    try {
      if (current instanceof Date) {
        return Number.isNaN(current.getTime()) ? "[INVALID DATE]" : current.toISOString();
      }
      if (current instanceof Error) {
        const output: { [key: string]: SafeOutputValue } = Object.create(null);
        output.name = redactString(current.name, limits.maxStringLength);
        output.message = redactString(current.message, limits.maxStringLength);
        return output;
      }
      if (Array.isArray(current)) {
        const output = current
          .slice(0, limits.maxArrayItems)
          .map((item) => visit(item, depth + 1));
        if (current.length > limits.maxArrayItems) output.push(TRUNCATED);
        return output;
      }
    } catch {
      return "[UNREADABLE OBJECT]";
    }

    let prototype: object | null;
    let descriptors: PropertyDescriptorMap;
    try {
      prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) return "[UNSUPPORTED OBJECT]";
      descriptors = Object.getOwnPropertyDescriptors(current);
    } catch {
      return "[UNREADABLE OBJECT]";
    }

    const output: { [key: string]: SafeOutputValue } = Object.create(null);
    const entries = Object.entries(descriptors)
      .filter(([, descriptor]) => descriptor.enumerable)
      .slice(0, limits.maxObjectKeys);
    for (const [key, descriptor] of entries) {
      if (DANGEROUS_KEYS.has(key.toLowerCase())) continue;
      if (isSensitiveKey(key)) {
        output[key] = REDACTED;
      } else if ("value" in descriptor) {
        if (descriptor.value === undefined) continue;
        output[key] = visit(descriptor.value, depth + 1);
      } else {
        output[key] = "[ACCESSOR OMITTED]";
      }
    }
    if (Object.keys(descriptors).length > entries.length) output[TRUNCATED] = true;
    return output;
  };

  return visit(value, 0);
}

export function safeOutputString(value: unknown, maxLength = 10_000): string {
  if (typeof value === "string") return redactString(value, maxLength);
  const safe = safeOutputValue(value, { maxStringLength: maxLength });
  if (typeof safe === "string") return safe;
  try {
    return JSON.stringify(safe);
  } catch {
    return "[UNSERIALIZABLE]";
  }
}

export function safeJsonStringify(value: unknown, space?: number): string {
  return JSON.stringify(safeOutputValue(value), null, space);
}

export function toPublicError(error: unknown, code: string): PublicError {
  const message = error instanceof Error ? error.message : String(error);
  return { error: safeOutputString(message, 500), code };
}

export interface AdminConfirmationRequest {
  method: string;
  params?: Record<string, unknown>;
}

export const READ_RPC_METHODS = new Set([
  "health",
  "status",
  "agents.list",
  "sessions.list",
  "sessions.describe",
  "sessions.preview",
  "tasks.list",
  "tasks.get",
  "cron.list",
  "cron.runs",
  "cron.status",
  "node.list",
  "exec.approval.list",
  "exec.approval.get",
  "logs.tail",
  "config.get",
  "config.schema",
  "usage.status",
]);

export const WRITE_RPC_METHODS = new Set([
  "sessions.abort",
  "sessions.steer",
  "sessions.patch",
  "cron.run",
  "cron.update",
  "exec.approval.resolve",
  "plugin.approval.resolve",
  "tools.invoke",
  "config.set",
  "config.patch",
  "config.apply",
  "update.run",
  "gateway.restart.request",
  "tasks.cancel",
]);

export const HIGH_RISK_RPC_METHODS = new Set([
  "sessions.abort",
  "sessions.steer",
  "sessions.patch",
  "tasks.cancel",
  "cron.run",
  "cron.update",
  "exec.approval.resolve",
  "plugin.approval.resolve",
  "tools.invoke",
  "config.set",
  "config.patch",
  "config.apply",
  "update.run",
  "gateway.restart.request",
]);

// sessions.delete is intentionally unsupported: the baseline listed it only as
// high-risk, never as an executable write method, so it was already fail-closed.

export function isWriteRpc(method: string): boolean {
  return WRITE_RPC_METHODS.has(method);
}

export function isHighRiskRpc(method: string): boolean {
  return HIGH_RISK_RPC_METHODS.has(method);
}

export function canonicalizeRpcParams(value: unknown): string {
  const ancestors = new WeakSet<object>();
  let nodes = 0;

  const visit = (current: unknown, depth: number): string => {
    nodes += 1;
    if (
      nodes > RUNTIME_LIMITS.gateway.maxJsonNodes ||
      depth > RUNTIME_LIMITS.gateway.maxJsonDepth
    ) {
      throw new Error("RPC parameters exceed JSON complexity limits");
    }
    if (current === undefined) return "u";
    if (current === null) return "n";
    if (typeof current === "boolean") return current ? "b1" : "b0";
    if (typeof current === "string") return `s${JSON.stringify(current)}`;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new Error("RPC parameters must contain only finite numbers");
      }
      return `d${Object.is(current, -0) ? "-0" : String(current)}`;
    }
    if (typeof current !== "object") {
      throw new Error(`Unsupported RPC parameter type: ${typeof current}`);
    }
    if (ancestors.has(current)) {
      throw new Error("RPC parameters must not contain circular references");
    }

    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        if (current.length > RUNTIME_LIMITS.gateway.maxArrayItems) {
          throw new Error("RPC parameter array exceeds item limit");
        }
        return `a[${current.map((item) => visit(item, depth + 1)).join(",")}]`;
      }

      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error("RPC parameters must contain only plain objects");
      }
      const descriptors = Object.getOwnPropertyDescriptors(current);
      const entries = Object.entries(descriptors)
        .filter(([, descriptor]) => descriptor.enumerable)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
      if (entries.length > RUNTIME_LIMITS.gateway.maxObjectKeys) {
        throw new Error("RPC parameter object exceeds key limit");
      }
      return `o{${entries
        .map(([key, descriptor]) => {
          if (!("value" in descriptor)) {
            throw new Error("RPC parameters must not contain accessors");
          }
          return `${JSON.stringify(key)}:${visit(descriptor.value, depth + 1)}`;
        })
        .join(",")}}`;
    } finally {
      ancestors.delete(current);
    }
  };

  return visit(value, 1);
}

export function redactValue(value: unknown, maxLen = 500): unknown {
  return safeOutputValue(value, {
    maxArrayItems: 20,
    maxObjectKeys: 50,
    maxStringLength: maxLen,
  });
}

export function summarizeParams(params: unknown): string {
  const redacted = safeOutputValue(params, {
    maxArrayItems: 20,
    maxObjectKeys: 50,
    maxStringLength: 500,
  });
  try {
    const s = JSON.stringify(redacted);
    return s.length > 1000 ? s.slice(0, 1000) + "…" : s;
  } catch {
    return "[UNSERIALIZABLE]";
  }
}

export function safeTimelineEvent(event: TimelineEvent): TimelineEvent {
  return {
    id: safeOutputString(event.id, 500),
    kind: event.kind,
    timestamp: safeOutputString(event.timestamp, 100),
    title: safeOutputString(event.title, 1_000),
    summary: event.summary === undefined ? undefined : safeOutputString(event.summary, 10_000),
    agentId: event.agentId === undefined ? undefined : safeOutputString(event.agentId, 500),
    sessionKey: event.sessionKey === undefined ? undefined : safeOutputString(event.sessionKey, 1_000),
    runId: event.runId === undefined ? undefined : safeOutputString(event.runId, 500),
    taskId: event.taskId === undefined ? undefined : safeOutputString(event.taskId, 500),
    severity: event.severity,
    payload: event.payload === undefined
      ? undefined
      : safeOutputValue(event.payload) as Record<string, unknown>,
  };
}

export function safeAuditLogEntry(entry: AuditLogEntry): AuditLogEntry {
  return {
    id: safeOutputString(entry.id, 500),
    timestamp: safeOutputString(entry.timestamp, 100),
    actor: safeOutputString(entry.actor, 500),
    method: safeOutputString(entry.method, 500),
    paramsSummary: safeOutputString(entry.paramsSummary, 1_000),
    success: entry.success,
    error: entry.error === undefined ? undefined : safeOutputString(entry.error, 1_000),
    resultSummary: entry.resultSummary === undefined ? undefined : safeOutputString(entry.resultSummary, 1_000),
  };
}

export function safeRuntimeSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  return {
    gatewayId: safeOutputString(snapshot.gatewayId, 500),
    connectionState: snapshot.connectionState,
    health: snapshot.health
      ? {
          ok: snapshot.health.ok,
          uptimeMs: snapshot.health.uptimeMs,
          version: snapshot.health.version === undefined ? undefined : safeOutputString(snapshot.health.version, 500),
          degraded: snapshot.health.degraded,
          raw: snapshot.health.raw === undefined
            ? undefined
            : safeOutputValue(snapshot.health.raw) as Record<string, unknown>,
        }
      : null,
    agents: snapshot.agents.slice(0, 200).map((agent) => ({
      id: safeOutputString(agent.id, 500),
      name: agent.name === undefined ? undefined : safeOutputString(agent.name, 500),
      model: agent.model === undefined ? undefined : safeOutputString(agent.model, 500),
      runtime: agent.runtime === undefined ? undefined : safeOutputString(agent.runtime, 500),
      runtimeSource: agent.runtimeSource === undefined ? undefined : safeOutputString(agent.runtimeSource, 500),
      thinkingDefault: agent.thinkingDefault === undefined ? undefined : safeOutputString(agent.thinkingDefault, 500),
      workspace: agent.workspace === undefined ? undefined : safeOutputString(agent.workspace, 2_000),
    })),
    sessions: snapshot.sessions.slice(0, 500).map((session) => ({
      key: safeOutputString(session.key, 1_000),
      sessionId: session.sessionId === undefined ? undefined : safeOutputString(session.sessionId, 500),
      kind: session.kind === undefined ? undefined : safeOutputString(session.kind, 500),
      agentId: session.agentId === undefined ? undefined : safeOutputString(session.agentId, 500),
      parentSessionKey: session.parentSessionKey === undefined ? undefined : safeOutputString(session.parentSessionKey, 1_000),
      spawnedBy: session.spawnedBy === undefined ? undefined : safeOutputString(session.spawnedBy, 500),
      ownerSessionKey: session.ownerSessionKey === undefined ? undefined : safeOutputString(session.ownerSessionKey, 1_000),
      spawnDepth: session.spawnDepth,
      subagentRole: session.subagentRole === undefined ? undefined : safeOutputString(session.subagentRole, 500),
      subagentControlScope: session.subagentControlScope === undefined
        ? undefined
        : safeOutputString(session.subagentControlScope, 500),
      forkedFromParent: session.forkedFromParent,
      label: session.label === undefined ? undefined : safeOutputString(session.label, 1_000),
      model: session.model === undefined ? undefined : safeOutputString(session.model, 500),
      modelProvider: session.modelProvider === undefined ? undefined : safeOutputString(session.modelProvider, 500),
      agentRuntime: session.agentRuntime === undefined ? undefined : safeOutputString(session.agentRuntime, 500),
      agentRuntimeSource: session.agentRuntimeSource === undefined
        ? undefined
        : safeOutputString(session.agentRuntimeSource, 500),
      startedAt: session.startedAt === undefined ? undefined : safeOutputString(session.startedAt, 100),
      endedAt: session.endedAt === undefined ? undefined : safeOutputString(session.endedAt, 100),
      runtimeMs: session.runtimeMs,
      updatedAt: session.updatedAt === undefined ? undefined : safeOutputString(session.updatedAt, 100),
      lastInteractionAt: session.lastInteractionAt === undefined ? undefined : safeOutputString(session.lastInteractionAt, 100),
      status: session.status === undefined ? undefined : safeOutputString(session.status, 100),
      isActive: session.isActive,
      hasActiveRun: session.hasActiveRun,
      hasActiveSubagentRun: session.hasActiveSubagentRun,
      subagentRunState: session.subagentRunState === undefined
        ? undefined
        : safeOutputString(session.subagentRunState, 500),
      abortedLastRun: session.abortedLastRun,
      currentRunId: session.currentRunId === undefined ? undefined : safeOutputString(session.currentRunId, 500),
      currentTool: session.currentTool === undefined ? undefined : safeOutputString(session.currentTool, 1_000),
      inputTokens: session.inputTokens,
      outputTokens: session.outputTokens,
      totalTokens: session.totalTokens,
      contextTokens: session.contextTokens,
      estimatedCostUsd: session.estimatedCostUsd,
      contextBudgetStatus: safeContextBudgetSummary(session.contextBudgetStatus),
      compactionCheckpointCount: session.compactionCheckpointCount,
      latestCompactionCheckpoint: safeCompactionCheckpointSummary(session.latestCompactionCheckpoint),
      compactionCheckpoint: safeCompactionCheckpointSummary(session.compactionCheckpoint),
      deliveryContext: safeDeliveryContextSummary(session.deliveryContext),
      origin: safeSessionOriginSummary(session.origin),
      spawnedWorkspaceDir: session.spawnedWorkspaceDir === undefined
        ? undefined
        : safeOutputString(session.spawnedWorkspaceDir, 2_000),
      spawnedCwd: session.spawnedCwd === undefined ? undefined : safeOutputString(session.spawnedCwd, 2_000),
      worktree: session.worktree
        ? {
            id: session.worktree.id === undefined ? undefined : safeOutputString(session.worktree.id, 500),
            path: session.worktree.path === undefined ? undefined : safeOutputString(session.worktree.path, 2_000),
            branch: session.worktree.branch === undefined ? undefined : safeOutputString(session.worktree.branch, 1_000),
            repoRoot: session.worktree.repoRoot === undefined ? undefined : safeOutputString(session.worktree.repoRoot, 2_000),
          }
        : undefined,
    })),
    tasks: snapshot.tasks.slice(0, 500).map((task) => ({
      id: safeOutputString(task.id, 500),
      status: task.status,
      kind: task.kind === undefined ? undefined : safeOutputString(task.kind, 500),
      title: task.title === undefined ? undefined : safeOutputString(task.title, 1_000),
      agentId: task.agentId === undefined ? undefined : safeOutputString(task.agentId, 500),
      sessionKey: task.sessionKey === undefined ? undefined : safeOutputString(task.sessionKey, 1_000),
      runId: task.runId === undefined ? undefined : safeOutputString(task.runId, 500),
      ownerKey: task.ownerKey === undefined ? undefined : safeOutputString(task.ownerKey, 1_000),
      childSessionKey: task.childSessionKey === undefined ? undefined : safeOutputString(task.childSessionKey, 1_000),
      sourceId: task.sourceId === undefined ? undefined : safeOutputString(task.sourceId, 500),
      flowId: task.flowId === undefined ? undefined : safeOutputString(task.flowId, 500),
      createdAt: task.createdAt === undefined ? undefined : safeOutputString(task.createdAt, 100),
      updatedAt: task.updatedAt === undefined ? undefined : safeOutputString(task.updatedAt, 100),
      startedAt: task.startedAt === undefined ? undefined : safeOutputString(task.startedAt, 100),
      endedAt: task.endedAt === undefined ? undefined : safeOutputString(task.endedAt, 100),
      runtime: safeTaskRuntimeSummary(task.runtime),
      progressSummary: task.progressSummary === undefined ? undefined : safeOutputString(task.progressSummary, 2_000),
      terminalSummary: task.terminalSummary === undefined ? undefined : safeOutputString(task.terminalSummary, 2_000),
      error: task.error === undefined ? undefined : safeOutputString(task.error, 2_000),
      errorCode: task.errorCode === undefined ? undefined : safeOutputString(task.errorCode, 500),
      errorKind: task.errorKind === undefined ? undefined : safeOutputString(task.errorKind, 500),
    })),
    cronJobs: snapshot.cronJobs.slice(0, 500).map((job) => ({
      id: safeOutputString(job.id, 500),
      name: job.name === undefined ? undefined : safeOutputString(job.name, 1_000),
      enabled: job.enabled,
      schedule: job.schedule === undefined ? undefined : safeOutputString(job.schedule, 1_000),
      nextRunAt: job.nextRunAt === undefined ? undefined : safeOutputString(job.nextRunAt, 100),
      lastRunAt: job.lastRunAt === undefined ? undefined : safeOutputString(job.lastRunAt, 100),
      lastStatus: job.lastStatus === undefined ? undefined : safeOutputString(job.lastStatus, 500),
    })),
    approvals: snapshot.approvals.slice(0, 500).map((approval) => ({
      id: safeOutputString(approval.id, 500),
      kind: approval.kind,
      status: approval.status,
      command: approval.command === undefined ? undefined : safeOutputString(approval.command, 5_000),
      sessionKey: approval.sessionKey === undefined ? undefined : safeOutputString(approval.sessionKey, 1_000),
      agentId: approval.agentId === undefined ? undefined : safeOutputString(approval.agentId, 500),
      requestedAt: approval.requestedAt === undefined ? undefined : safeOutputString(approval.requestedAt, 100),
      resolvedAt: approval.resolvedAt === undefined ? undefined : safeOutputString(approval.resolvedAt, 100),
      consumedAt: approval.consumedAt === undefined ? undefined : safeOutputString(approval.consumedAt, 100),
      expiresAt: approval.expiresAt === undefined ? undefined : safeOutputString(approval.expiresAt, 100),
      timeoutMs: approval.timeoutMs,
      host: approval.host === undefined ? undefined : safeOutputString(approval.host, 1_000),
      cwd: approval.cwd === undefined ? undefined : safeOutputString(approval.cwd, 2_000),
      scope: approval.scope === undefined ? undefined : safeOutputString(approval.scope, 1_000),
      decision: approval.decision === undefined ? undefined : safeOutputString(approval.decision, 500),
      failureReason: approval.failureReason === undefined ? undefined : safeOutputString(approval.failureReason, 2_000),
      error: approval.error === undefined ? undefined : safeOutputString(approval.error, 2_000),
    })),
    nodes: snapshot.nodes.slice(0, 500).map((node) => ({
      id: safeOutputString(node.id, 500),
      label: node.label === undefined ? undefined : safeOutputString(node.label, 1_000),
      connected: node.connected,
      platform: node.platform === undefined ? undefined : safeOutputString(node.platform, 500),
    })),
    activeRunCount: snapshot.activeRunCount,
    pendingApprovalCount: snapshot.pendingApprovalCount,
    failedTaskCount: snapshot.failedTaskCount,
    discovery: snapshot.discovery
      ? {
          sessions: {
            state: snapshot.discovery.sessions.state,
            degraded: snapshot.discovery.sessions.degraded,
            pagesFetched: snapshot.discovery.sessions.pagesFetched,
            rowsFetched: snapshot.discovery.sessions.rowsFetched,
            uniqueSessionsFetched: snapshot.discovery.sessions.uniqueSessionsFetched,
            publishedSessions: snapshot.discovery.sessions.publishedSessions,
            expectedTotal: snapshot.discovery.sessions.expectedTotal,
            nextOffset: snapshot.discovery.sessions.nextOffset,
            reason: snapshot.discovery.sessions.reason,
            retainedLastComplete: snapshot.discovery.sessions.retainedLastComplete,
            message: snapshot.discovery.sessions.message === undefined
              ? undefined
              : safeOutputString(snapshot.discovery.sessions.message, 2_000),
          },
        }
      : undefined,
    updatedAt: safeOutputString(snapshot.updatedAt, 100),
  };
}

function safeContextBudgetSummary(value: ContextBudgetSummary | undefined): ContextBudgetSummary | undefined {
  if (!value) return undefined;
  return {
    schemaVersion: value.schemaVersion,
    source: value.source === undefined ? undefined : safeOutputString(value.source, 500),
    updatedAt: value.updatedAt === undefined ? undefined : safeOutputString(value.updatedAt, 100),
    provider: value.provider === undefined ? undefined : safeOutputString(value.provider, 500),
    model: value.model === undefined ? undefined : safeOutputString(value.model, 500),
    route: value.route === undefined ? undefined : safeOutputString(value.route, 500),
    shouldCompact: value.shouldCompact,
    estimatedPromptTokens: value.estimatedPromptTokens,
    contextTokenBudget: value.contextTokenBudget,
    promptBudgetBeforeReserve: value.promptBudgetBeforeReserve,
    reserveTokens: value.reserveTokens,
    effectiveReserveTokens: value.effectiveReserveTokens,
    remainingPromptBudgetTokens: value.remainingPromptBudgetTokens,
    overflowTokens: value.overflowTokens,
    toolResultReducibleChars: value.toolResultReducibleChars,
    messageCount: value.messageCount,
    unwindowedMessageCount: value.unwindowedMessageCount,
    sessionId: value.sessionId === undefined ? undefined : safeOutputString(value.sessionId, 500),
    status: value.status === undefined ? undefined : safeOutputString(value.status, 500),
    reason: value.reason === undefined ? undefined : safeOutputString(value.reason, 1_000),
    budgetTokens: value.budgetTokens,
    remainingTokens: value.remainingTokens,
    usedPercent: value.usedPercent,
  };
}

function safeCompactionCheckpointSummary(
  value: CompactionCheckpointSummary | undefined,
): CompactionCheckpointSummary | undefined {
  if (!value) return undefined;
  return {
    checkpointId: value.checkpointId === undefined ? undefined : safeOutputString(value.checkpointId, 500),
    createdAt: value.createdAt === undefined ? undefined : safeOutputString(value.createdAt, 100),
    timestamp: value.timestamp === undefined ? undefined : safeOutputString(value.timestamp, 100),
    reason: value.reason === undefined ? undefined : safeOutputString(value.reason, 1_000),
    tokensBefore: value.tokensBefore,
    tokensAfter: value.tokensAfter,
  };
}

function safeDeliveryContextSummary(value: DeliveryContextSummary | undefined): DeliveryContextSummary | undefined {
  if (!value) return undefined;
  return {
    channel: value.channel === undefined ? undefined : safeOutputString(value.channel, 500),
    to: value.to === undefined ? undefined : safeOutputString(value.to, 1_000),
    accountId: value.accountId === undefined ? undefined : safeOutputString(value.accountId, 500),
    threadId: value.threadId === undefined ? undefined : safeOutputString(value.threadId, 500),
  };
}

function safeSessionOriginSummary(value: SessionOriginSummary | undefined): SessionOriginSummary | undefined {
  if (!value) return undefined;
  return {
    provider: value.provider === undefined ? undefined : safeOutputString(value.provider, 500),
    surface: value.surface === undefined ? undefined : safeOutputString(value.surface, 500),
    chatType: value.chatType === undefined ? undefined : safeOutputString(value.chatType, 500),
    accountId: value.accountId === undefined ? undefined : safeOutputString(value.accountId, 500),
    nativeChannelId: value.nativeChannelId === undefined
      ? undefined
      : safeOutputString(value.nativeChannelId, 500),
    channelId: value.channelId === undefined ? undefined : safeOutputString(value.channelId, 500),
    threadId: value.threadId === undefined ? undefined : safeOutputString(value.threadId, 500),
  };
}

function safeTaskRuntimeSummary(value: TaskRuntimeSummary | undefined): TaskRuntimeSummary | undefined {
  if (!value) return undefined;
  return {
    id: value.id === undefined ? undefined : safeOutputString(value.id, 500),
    source: value.source === undefined ? undefined : safeOutputString(value.source, 500),
    startedAt: value.startedAt === undefined ? undefined : safeOutputString(value.startedAt, 100),
    endedAt: value.endedAt === undefined ? undefined : safeOutputString(value.endedAt, 100),
    runtimeMs: value.runtimeMs,
  };
}

export interface SafeSessionPreview {
  previews: Array<{
    key?: string;
    status?: string;
    items: Array<{ id?: string; role?: string; text?: string }>;
  }>;
}

export function safeSessionPreview(value: unknown): SafeSessionPreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { previews: [] };
  let previews: unknown;
  try {
    previews = (value as Record<string, unknown>).previews;
  } catch {
    return { previews: [] };
  }
  if (!Array.isArray(previews)) return { previews: [] };
  return {
    previews: previews.slice(0, 25).flatMap((preview) => {
      if (!preview || typeof preview !== "object" || Array.isArray(preview)) return [];
      const record = safeOutputValue(preview) as Record<string, unknown>;
      const items = Array.isArray(record.items)
        ? record.items.slice(0, 50).flatMap((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return [];
            const itemRecord = item as Record<string, unknown>;
            return [{
              id: typeof itemRecord.id === "string" ? itemRecord.id : undefined,
              role: typeof itemRecord.role === "string" ? itemRecord.role : undefined,
              text: typeof itemRecord.text === "string" ? itemRecord.text : undefined,
            }];
          })
        : [];
      return [{
        key: typeof record.key === "string" ? record.key : undefined,
        status: typeof record.status === "string" ? record.status : undefined,
        items,
      }];
    }),
  };
}
