/** Normalized runtime types for Dashclaw Agent OS */

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
  workspace?: string;
}

export interface SessionSummary {
  key: string;
  agentId?: string;
  parentSessionKey?: string;
  spawnedBy?: string;
  ownerSessionKey?: string;
  label?: string;
  model?: string;
  agentRuntime?: string;
  updatedAt?: string;
  lastInteractionAt?: string;
  status?: string;
  isActive?: boolean;
  currentRunId?: string;
  currentTool?: string;
}

export interface TaskSummary {
  id: string;
  status: TaskStatus;
  kind?: string;
  title?: string;
  agentId?: string;
  sessionKey?: string;
  runId?: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
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
  status: "pending" | "approved" | "denied";
  command?: string;
  sessionKey?: string;
  agentId?: string;
  requestedAt?: string;
}

export interface NodeSummary {
  id: string;
  label?: string;
  connected: boolean;
  platform?: string;
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
  actor?: string;
  confirmToken?: string;
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
  "config.set",
  "config.patch",
  "config.apply",
  "update.run",
  "gateway.restart.request",
  "tools.invoke",
  "sessions.delete",
]);

export function isWriteRpc(method: string): boolean {
  return WRITE_RPC_METHODS.has(method);
}

export function isHighRiskRpc(method: string): boolean {
  return HIGH_RISK_RPC_METHODS.has(method);
}

export function redactValue(value: unknown, maxLen = 500): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    let s = value;
    s = s.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
    s = s.replace(/("?(?:token|password|secret|apiKey|api_key)"?\s*[:=]\s*")([^"]+)(")/gi, '$1[REDACTED]$3');
    if (s.length > maxLen) return s.slice(0, maxLen) + "…";
    return s;
  }
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      return value.slice(0, 20).map((v) => redactValue(v, maxLen));
    }
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj).slice(0, 50)) {
      const lk = k.toLowerCase();
      if (lk.includes("token") || lk.includes("password") || lk.includes("secret") || lk.includes("apikey")) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactValue(v, maxLen);
      }
    }
    return out;
  }
  return value;
}

export function summarizeParams(params: unknown): string {
  const redacted = redactValue(params);
  try {
    const s = JSON.stringify(redacted);
    return s.length > 1000 ? s.slice(0, 1000) + "…" : s;
  } catch {
    return String(redacted);
  }
}
