import {
  RUNTIME_LIMITS,
  type AuditLogEntry,
  type RuntimeSnapshot,
  type TimelineEvent,
} from "@dashclaw/runtime-model";

export interface SessionPreviewItem {
  id?: string;
  role?: string;
  text?: string;
}

export interface SessionPreviewData {
  previews?: Array<{
    key?: string;
    status?: string;
    items?: SessionPreviewItem[];
  }>;
}

export class PayloadValidationError extends Error {
  constructor(context: string) {
    super(`Invalid or excessive ${context} payload`);
    this.name = "PayloadValidationError";
  }
}

export function parseSnapshot(value: unknown): RuntimeSnapshot {
  assertBoundedJson(value, "snapshot");
  if (!isRecord(value)) throw new PayloadValidationError("snapshot");
  const collections = ["agents", "sessions", "tasks", "cronJobs", "approvals", "nodes"] as const;
  if (
    !isString(value.gatewayId) ||
    !["disconnected", "connecting", "connected", "reconnecting"].includes(String(value.connectionState)) ||
    !isString(value.updatedAt) ||
    !collections.every((key) => isBoundedArray(value[key], RUNTIME_LIMITS.browser.maxSnapshotItemsPerCollection)) ||
    !isCount(value.activeRunCount) ||
    !isCount(value.pendingApprovalCount) ||
    !isCount(value.failedTaskCount)
  ) {
    throw new PayloadValidationError("snapshot");
  }
  if (
    !isHealth(value.health) ||
    !(value.agents as unknown[]).every(isAgent) ||
    !(value.sessions as unknown[]).every(isSession) ||
    !(value.tasks as unknown[]).every(isTask) ||
    !(value.cronJobs as unknown[]).every(isCronJob) ||
    !(value.approvals as unknown[]).every(isApproval) ||
    !(value.nodes as unknown[]).every(isNode)
  ) {
    throw new PayloadValidationError("snapshot");
  }
  return value as unknown as RuntimeSnapshot;
}

export function parseTimelineResponse(value: unknown): TimelineEvent[] {
  if (!isRecord(value) || !isBoundedArray(value.events, RUNTIME_LIMITS.http.timelineMax)) {
    throw new PayloadValidationError("timeline");
  }
  assertBoundedJson(value, "timeline");
  if (!(value.events as unknown[]).every(isTimelineEvent)) {
    throw new PayloadValidationError("timeline");
  }
  return value.events as TimelineEvent[];
}

export function parseAuditResponse(value: unknown): AuditLogEntry[] {
  if (!isRecord(value) || !isBoundedArray(value.entries, RUNTIME_LIMITS.http.auditMax)) {
    throw new PayloadValidationError("audit");
  }
  assertBoundedJson(value, "audit");
  if (!(value.entries as unknown[]).every(isAuditEntry)) {
    throw new PayloadValidationError("audit");
  }
  return value.entries as AuditLogEntry[];
}

export function parseSessionPreview(value: unknown): SessionPreviewData {
  assertBoundedJson(value, "session preview");
  if (!isRecord(value)) throw new PayloadValidationError("session preview");
  if (value.previews === undefined) return {};
  if (!isBoundedArray(value.previews, 5)) throw new PayloadValidationError("session preview");
  const previews = value.previews.map((preview) => {
    if (!isRecord(preview)) throw new PayloadValidationError("session preview");
    if (
      preview.items !== undefined &&
      !isBoundedArray(preview.items, RUNTIME_LIMITS.browser.maxSessionPreviewItems)
    ) {
      throw new PayloadValidationError("session preview");
    }
    const items = (preview.items ?? []).map((item) => {
      if (!isRecord(item) || !optionalStrings(item, ["id", "role", "text"])) {
        throw new PayloadValidationError("session preview");
      }
      return {
        id: stringOrUndefined(item.id),
        role: stringOrUndefined(item.role),
        text: stringOrUndefined(item.text),
      };
    });
    if (!optionalStrings(preview, ["key", "status"])) throw new PayloadValidationError("session preview");
    return {
      key: stringOrUndefined(preview.key),
      status: stringOrUndefined(preview.status),
      items,
    };
  });
  return { previews };
}

export function parseCronRuns(value: unknown): unknown {
  assertBoundedJson(value, "cron runs");
  if (!isRecord(value)) throw new PayloadValidationError("cron runs");
  if (Array.isArray(value.runs)) {
    return { ...value, runs: value.runs.slice(0, RUNTIME_LIMITS.browser.maxCronRuns) };
  }
  return value;
}

export function parseConfirmation(value: unknown): { confirmToken: string } {
  if (!isRecord(value) || !isString(value.confirmToken)) {
    throw new PayloadValidationError("confirmation");
  }
  return { confirmToken: value.confirmToken };
}

export function parseRpcResult(
  value: unknown,
): { ok: boolean; result?: unknown; error?: string } {
  assertBoundedJson(value, "RPC result");
  if (!isRecord(value) || typeof value.ok !== "boolean" || !optionalStrings(value, ["error"])) {
    throw new PayloadValidationError("RPC result");
  }
  return { ok: value.ok, result: value.result, error: stringOrUndefined(value.error) };
}

export function parseSseSnapshot(raw: string): RuntimeSnapshot {
  return parseSnapshot(parseSseJson(raw, "SSE snapshot"));
}

export function parseSseTimeline(raw: string): TimelineEvent {
  const value = parseSseJson(raw, "SSE timeline");
  if (!isTimelineEvent(value)) throw new PayloadValidationError("SSE timeline");
  return value;
}

export function parseSseAudit(raw: string): AuditLogEntry[] {
  const value = parseSseJson(raw, "SSE audit");
  if (!isBoundedArray(value, RUNTIME_LIMITS.http.auditMax) || !value.every(isAuditEntry)) {
    throw new PayloadValidationError("SSE audit");
  }
  return value;
}

export function parseBoundedJsonText(text: string, context = "API"): unknown {
  if (new TextEncoder().encode(text).byteLength > RUNTIME_LIMITS.browser.maxApiResponseBytes) {
    throw new PayloadValidationError(context);
  }
  try {
    const value: unknown = JSON.parse(text);
    assertBoundedJson(value, context);
    return value;
  } catch (error) {
    if (error instanceof PayloadValidationError) throw error;
    throw new PayloadValidationError(context);
  }
}

export function safeRawPreview(value: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(value, null, 2);
  } catch {
    return "[Preview unavailable]";
  }
  if (serialized.length <= RUNTIME_LIMITS.browser.maxRawPreviewChars) return serialized;
  return `${serialized.slice(0, RUNTIME_LIMITS.browser.maxRawPreviewChars)}\n… [preview truncated]`;
}

function parseSseJson(raw: string, context: string): unknown {
  if (new TextEncoder().encode(raw).byteLength > RUNTIME_LIMITS.browser.maxSseEventBytes) {
    throw new PayloadValidationError(context);
  }
  return parseBoundedJsonText(raw, context);
}

function assertBoundedJson(value: unknown, context: string): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (
      nodes > RUNTIME_LIMITS.gateway.maxJsonNodes ||
      current.depth > RUNTIME_LIMITS.gateway.maxJsonDepth
    ) {
      throw new PayloadValidationError(context);
    }
    if (current.value === null || typeof current.value !== "object") continue;
    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value as Record<string, unknown>);
    if (
      (Array.isArray(current.value) && children.length > RUNTIME_LIMITS.gateway.maxArrayItems) ||
      (!Array.isArray(current.value) && children.length > RUNTIME_LIMITS.gateway.maxObjectKeys)
    ) {
      throw new PayloadValidationError(context);
    }
    for (const child of children) stack.push({ value: child, depth: current.depth + 1 });
  }
}

function isHealth(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      typeof value.ok === "boolean" &&
      optionalStrings(value, ["version"]) &&
      optionalBooleans(value, ["degraded"]) &&
      (value.uptimeMs === undefined || isCount(value.uptimeMs)) &&
      (value.raw === undefined || isRecord(value.raw)))
  );
}

function isAgent(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    optionalStrings(value, ["name", "model", "runtime", "workspace"])
  );
}

function isSession(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isString(value.key) ||
    !optionalStrings(value, [
      "agentId",
      "parentSessionKey",
      "spawnedBy",
      "ownerSessionKey",
      "label",
      "model",
      "agentRuntime",
      "updatedAt",
      "lastInteractionAt",
      "status",
      "currentRunId",
      "currentTool",
    ]) ||
    !optionalBooleans(value, ["isActive"])
  ) {
    return false;
  }
  return (
    value.worktree === undefined ||
    (isRecord(value.worktree) &&
      optionalStrings(value.worktree, ["id", "path", "branch", "repoRoot"]))
  );
}

function isTask(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    ["queued", "running", "completed", "failed", "cancelled", "timed_out"].includes(String(value.status)) &&
    optionalStrings(value, [
      "kind",
      "title",
      "agentId",
      "sessionKey",
      "runId",
      "startedAt",
      "endedAt",
      "error",
    ])
  );
}

function isCronJob(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    typeof value.enabled === "boolean" &&
    optionalStrings(value, ["name", "schedule", "nextRunAt", "lastRunAt", "lastStatus"])
  );
}

function isApproval(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    ["exec", "plugin"].includes(String(value.kind)) &&
    ["pending", "approved", "denied", "expired", "consumed"].includes(String(value.status)) &&
    optionalStrings(value, [
      "command",
      "sessionKey",
      "agentId",
      "requestedAt",
      "resolvedAt",
      "consumedAt",
      "expiresAt",
      "host",
      "cwd",
      "scope",
      "decision",
      "failureReason",
      "error",
    ]) &&
    (value.timeoutMs === undefined || isCount(value.timeoutMs))
  );
}

function isNode(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    typeof value.connected === "boolean" &&
    optionalStrings(value, ["label", "platform"])
  );
}

function isTimelineEvent(value: unknown): value is TimelineEvent {
  const kinds = new Set([
    "agent.lifecycle",
    "agent.assistant",
    "agent.tool",
    "session.message",
    "session.operation",
    "session.tool",
    "sessions.changed",
    "cron",
    "health",
    "presence",
    "heartbeat",
    "approval.requested",
    "approval.resolved",
    "admin.action",
    "gateway.connected",
    "gateway.disconnected",
    "gateway.shutdown",
    "chat",
  ]);
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.kind) &&
    kinds.has(value.kind) &&
    isString(value.timestamp) &&
    isString(value.title) &&
    optionalStrings(value, ["summary", "agentId", "sessionKey", "runId", "taskId"]) &&
    (value.severity === undefined || ["info", "warn", "error"].includes(String(value.severity))) &&
    (value.payload === undefined || isRecord(value.payload))
  );
}

function isAuditEntry(value: unknown): value is AuditLogEntry {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.timestamp) &&
    isString(value.actor) &&
    isString(value.method) &&
    isString(value.paramsSummary) &&
    typeof value.success === "boolean" &&
    optionalStrings(value, ["error", "resultSummary"])
  );
}

function optionalStrings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => value[key] === undefined || isString(value[key]));
}

function optionalBooleans(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => value[key] === undefined || typeof value[key] === "boolean");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length <= RUNTIME_LIMITS.storage.maxTimelineSummaryChars;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isBoundedArray(value: unknown, maximum: number): value is unknown[] {
  return Array.isArray(value) && value.length <= maximum;
}
