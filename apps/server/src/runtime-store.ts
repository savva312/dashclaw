import Database from "better-sqlite3";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type {
  AuditLogEntry,
  RuntimeSnapshot,
  TimelineEvent,
  TimelineEventKind,
} from "@dashclaw/runtime-model";
import {
  RUNTIME_LIMITS,
  safeAuditLogEntry,
  safeRuntimeSnapshot,
  safeTimelineEvent,
} from "@dashclaw/runtime-model";
import {
  prepareRuntimeData,
  secureRuntimeDatabaseFiles,
  type RuntimeDataSecurityOptions,
} from "./runtime-data-security.js";

export interface RuntimeStoreOptions extends RuntimeDataSecurityOptions {
  maxTimelineRows?: number;
  maxAuditRows?: number;
  highWaterBytes?: number;
}

export interface StorageHealth {
  timelineRows: number;
  auditRows: number;
  databaseBytes: number;
  usedBytes: number;
  highWaterBytes: number;
  overHighWater: boolean;
}

export class StorageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageLimitError";
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  agent_id TEXT,
  session_key TEXT,
  run_id TEXT,
  task_id TEXT,
  severity TEXT,
  payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_timeline_ts ON timeline_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_kind ON timeline_events(kind);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  actor TEXT NOT NULL,
  method TEXT NOT NULL,
  params_summary TEXT NOT NULL,
  success INTEGER NOT NULL,
  error TEXT,
  result_summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp DESC);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export class RuntimeStore {
  private db: Database.Database;
  private readonly maxTimelineRows: number;
  private readonly maxAuditRows: number;
  private readonly highWaterBytes: number;

  constructor(dbPath: string, options: RuntimeStoreOptions = {}) {
    this.maxTimelineRows = positiveInteger(options.maxTimelineRows, RUNTIME_LIMITS.storage.maxTimelineRows);
    this.maxAuditRows = positiveInteger(options.maxAuditRows, RUNTIME_LIMITS.storage.maxAuditRows);
    this.highWaterBytes = positiveInteger(options.highWaterBytes, RUNTIME_LIMITS.storage.highWaterBytes);
    const prepared = prepareRuntimeData(dbPath, options);
    const previousUmask = prepared.enforcePosixPermissions ? process.umask(0o077) : undefined;
    let db: Database.Database | undefined;

    try {
      db = new Database(prepared.dbPath);
      secureRuntimeDatabaseFiles(prepared);
      db.pragma("journal_mode = WAL");
      secureRuntimeDatabaseFiles(prepared);
      db.exec(SCHEMA);
      secureRuntimeDatabaseFiles(prepared);
      this.db = db;
      this.pruneRetention();
    } catch (error) {
      db?.close();
      throw error;
    } finally {
      if (previousUmask !== undefined) process.umask(previousUmask);
    }
  }

  appendTimeline(event: Omit<TimelineEvent, "id"> & { id?: string }): TimelineEvent {
    this.assertStorageWritable();
    const row = safeTimelineEvent({
      id: event.id ?? randomUUID(),
      kind: event.kind,
      timestamp: event.timestamp,
      title: truncate(event.title, RUNTIME_LIMITS.storage.maxTimelineTitleChars),
      summary: truncateOptional(event.summary, RUNTIME_LIMITS.storage.maxTimelineSummaryChars),
      agentId: event.agentId,
      sessionKey: event.sessionKey,
      runId: event.runId,
      taskId: event.taskId,
      severity: event.severity,
      payload: event.payload,
    });
    const storedPayload = normalizeTimelinePayload(row.payload);
    row.payload = storedPayload.payload;
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO timeline_events (id, kind, timestamp, title, summary, agent_id, session_key, run_id, task_id, severity, payload)
           VALUES (@id, @kind, @timestamp, @title, @summary, @agentId, @sessionKey, @runId, @taskId, @severity, @payloadJson)`,
        )
        .run({ ...row, payloadJson: storedPayload.json });
      this.pruneTimeline();
    })();
    return row;
  }

  upsertTimeline(event: Omit<TimelineEvent, "id"> & { id: string }): TimelineEvent {
    this.assertStorageWritable();
    const row = safeTimelineEvent({
      id: event.id,
      kind: event.kind,
      timestamp: event.timestamp,
      title: truncate(event.title, RUNTIME_LIMITS.storage.maxTimelineTitleChars),
      summary: truncateOptional(event.summary, RUNTIME_LIMITS.storage.maxTimelineSummaryChars),
      agentId: event.agentId,
      sessionKey: event.sessionKey,
      runId: event.runId,
      taskId: event.taskId,
      severity: event.severity,
      payload: event.payload,
    });
    const storedPayload = normalizeTimelinePayload(row.payload);
    row.payload = storedPayload.payload;
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO timeline_events (id, kind, timestamp, title, summary, agent_id, session_key, run_id, task_id, severity, payload)
           VALUES (@id, @kind, @timestamp, @title, @summary, @agentId, @sessionKey, @runId, @taskId, @severity, @payloadJson)
           ON CONFLICT(id) DO UPDATE SET
             rowid = (SELECT COALESCE(MAX(rowid), 0) + 1 FROM timeline_events),
             kind = excluded.kind,
             title = excluded.title,
             summary = excluded.summary,
             agent_id = excluded.agent_id,
             session_key = excluded.session_key,
             run_id = excluded.run_id,
             task_id = excluded.task_id,
             severity = excluded.severity,
             payload = excluded.payload`,
        )
        .run({ ...row, payloadJson: storedPayload.json });
      this.pruneTimeline();
    })();
    return row;
  }

  listTimeline(limit = 200, kind?: TimelineEventKind): TimelineEvent[] {
    const boundedLimit = clampListLimit(limit, RUNTIME_LIMITS.http.timelineDefault, RUNTIME_LIMITS.http.timelineMax);
    const rows = kind
      ? this.db
          .prepare(`SELECT * FROM timeline_events WHERE kind = ? ORDER BY timestamp DESC LIMIT ?`)
          .all(kind, boundedLimit)
      : this.db.prepare(`SELECT * FROM timeline_events ORDER BY timestamp DESC LIMIT ?`).all(boundedLimit);
    return (rows as Record<string, unknown>[]).map(mapTimelineRow).map(safeTimelineEvent).reverse();
  }

  appendAudit(entry: Omit<AuditLogEntry, "id"> & { id?: string }): AuditLogEntry {
    this.assertStorageWritable();
    const row = safeAuditLogEntry({
      id: entry.id ?? randomUUID(),
      timestamp: entry.timestamp,
      actor: truncate(entry.actor, RUNTIME_LIMITS.storage.maxAuditFieldChars),
      method: truncate(entry.method, RUNTIME_LIMITS.storage.maxAuditFieldChars),
      paramsSummary: truncate(entry.paramsSummary, RUNTIME_LIMITS.storage.maxAuditFieldChars),
      success: entry.success,
      error: truncateOptional(entry.error, RUNTIME_LIMITS.storage.maxAuditFieldChars),
      resultSummary: truncateOptional(entry.resultSummary, RUNTIME_LIMITS.storage.maxAuditFieldChars),
    });
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO audit_log (id, timestamp, actor, method, params_summary, success, error, result_summary)
           VALUES (@id, @timestamp, @actor, @method, @paramsSummary, @success, @error, @resultSummary)`,
        )
        .run({
          id: row.id,
          timestamp: row.timestamp,
          actor: row.actor,
          method: row.method,
          paramsSummary: row.paramsSummary,
          success: row.success ? 1 : 0,
          error: row.error ?? null,
          resultSummary: row.resultSummary ?? null,
        });
      this.pruneAudit();
    })();
    return row;
  }

  listAudit(limit = 100): AuditLogEntry[] {
    const boundedLimit = clampListLimit(limit, 100, RUNTIME_LIMITS.http.auditMax);
    const rows = this.db.prepare(`SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?`).all(boundedLimit);
    return (rows as Record<string, unknown>[]).map((r) =>
      safeAuditLogEntry({
        id: String(r.id),
        timestamp: String(r.timestamp),
        actor: String(r.actor),
        method: String(r.method),
        paramsSummary: String(r.params_summary),
        success: Boolean(r.success),
        error: r.error ? String(r.error) : undefined,
        resultSummary: r.result_summary ? String(r.result_summary) : undefined,
      }),
    );
  }

  saveSnapshot(snapshot: RuntimeSnapshot): void {
    this.assertStorageWritable();
    const safeSnapshot = safeRuntimeSnapshot(snapshot);
    const data = JSON.stringify(safeSnapshot);
    if (Buffer.byteLength(data, "utf8") > RUNTIME_LIMITS.storage.maxSnapshotBytes) {
      throw new StorageLimitError("Runtime snapshot exceeds storage byte limit");
    }
    this.db
      .prepare(
        `INSERT INTO snapshots (id, data, updated_at) VALUES (1, @data, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run({ data, updatedAt: safeSnapshot.updatedAt });
  }

  getSnapshot(): RuntimeSnapshot | null {
    const row = this.db.prepare(`SELECT data FROM snapshots WHERE id = 1`).get() as { data?: string } | undefined;
    if (!row?.data) return null;
    try {
      return safeRuntimeSnapshot(JSON.parse(row.data) as RuntimeSnapshot);
    } catch {
      return null;
    }
  }

  getStorageHealth(): StorageHealth {
    const timelineRows = Number(
      (this.db.prepare(`SELECT COUNT(*) AS count FROM timeline_events`).get() as { count: number }).count,
    );
    const auditRows = Number(
      (this.db.prepare(`SELECT COUNT(*) AS count FROM audit_log`).get() as { count: number }).count,
    );
    const { databaseBytes, usedBytes } = this.getStoragePageUsage();
    return {
      timelineRows,
      auditRows,
      databaseBytes,
      usedBytes,
      highWaterBytes: this.highWaterBytes,
      overHighWater: usedBytes >= this.highWaterBytes,
    };
  }

  close(): void {
    this.db.close();
  }

  private assertStorageWritable(): void {
    if (this.getStoragePageUsage().usedBytes >= this.highWaterBytes) {
      throw new StorageLimitError("Runtime storage high-water mark reached");
    }
  }

  private getStoragePageUsage(): { databaseBytes: number; usedBytes: number } {
    const pageCount = Number(this.db.pragma("page_count", { simple: true }));
    const freePages = Number(this.db.pragma("freelist_count", { simple: true }));
    const pageSize = Number(this.db.pragma("page_size", { simple: true }));
    return {
      databaseBytes: pageCount * pageSize,
      usedBytes: Math.max(0, pageCount - freePages) * pageSize,
    };
  }

  private pruneRetention(): void {
    this.db.transaction(() => {
      this.pruneTimeline();
      this.pruneAudit();
    })();
  }

  private pruneTimeline(): void {
    this.db
      .prepare(
        `DELETE FROM timeline_events
         WHERE rowid IN (
           SELECT rowid FROM timeline_events
           ORDER BY rowid DESC
           LIMIT -1 OFFSET ?
         )`,
      )
      .run(this.maxTimelineRows);
  }

  private pruneAudit(): void {
    this.db
      .prepare(
        `DELETE FROM audit_log
         WHERE rowid IN (
           SELECT rowid FROM audit_log
           ORDER BY rowid DESC
           LIMIT -1 OFFSET ?
         )`,
      )
      .run(this.maxAuditRows);
  }
}

function mapTimelineRow(r: Record<string, unknown>): TimelineEvent {
  let payload: Record<string, unknown> | undefined;
  if (r.payload) {
    try {
      payload = JSON.parse(String(r.payload)) as Record<string, unknown>;
    } catch {
      payload = undefined;
    }
  }
  return {
    id: String(r.id),
    kind: r.kind as TimelineEventKind,
    timestamp: String(r.timestamp),
    title: String(r.title),
    summary: r.summary ? String(r.summary) : undefined,
    agentId: r.agent_id ? String(r.agent_id) : undefined,
    sessionKey: r.session_key ? String(r.session_key) : undefined,
    runId: r.run_id ? String(r.run_id) : undefined,
    taskId: r.task_id ? String(r.task_id) : undefined,
    severity: r.severity ? (r.severity as TimelineEvent["severity"]) : undefined,
    payload,
  };
}

function normalizeTimelinePayload(payload?: Record<string, unknown>): {
  payload?: Record<string, unknown>;
  json: string | null;
} {
  if (!payload) return { json: null };
  let json: string;
  try {
    json = JSON.stringify(payload);
  } catch {
    const invalid = { truncated: true, reason: "payload was not serializable" };
    return { payload: invalid, json: JSON.stringify(invalid) };
  }
  if (Buffer.byteLength(json, "utf8") <= RUNTIME_LIMITS.storage.maxTimelinePayloadBytes) {
    return { payload, json };
  }
  const bounded = { truncated: true, reason: "payload exceeded storage limit" };
  return { payload: bounded, json: JSON.stringify(bounded) };
}

function clampListLimit(value: number, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(1, Math.trunc(value)));
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isInteger(value) || (value ?? 0) < 1) return fallback;
  return value!;
}

function truncate(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function truncateOptional(value: string | undefined, maximum: number): string | undefined {
  return value === undefined ? undefined : truncate(value, maximum);
}
