import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  AuditLogEntry,
  RuntimeSnapshot,
  TimelineEvent,
  TimelineEventKind,
} from "@dashclaw/runtime-model";

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

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  appendTimeline(event: Omit<TimelineEvent, "id"> & { id?: string }): TimelineEvent {
    const row: TimelineEvent = {
      id: event.id ?? randomUUID(),
      kind: event.kind,
      timestamp: event.timestamp,
      title: event.title,
      summary: event.summary,
      agentId: event.agentId,
      sessionKey: event.sessionKey,
      runId: event.runId,
      taskId: event.taskId,
      severity: event.severity,
      payload: event.payload,
    };
    this.db
      .prepare(
        `INSERT INTO timeline_events (id, kind, timestamp, title, summary, agent_id, session_key, run_id, task_id, severity, payload)
         VALUES (@id, @kind, @timestamp, @title, @summary, @agentId, @sessionKey, @runId, @taskId, @severity, @payloadJson)`,
      )
      .run({
        ...row,
        payloadJson: row.payload ? JSON.stringify(row.payload) : null,
      });
    return row;
  }

  upsertTimeline(event: Omit<TimelineEvent, "id"> & { id: string }): TimelineEvent {
    const row: TimelineEvent = { ...event };
    this.db
      .prepare(
        `INSERT INTO timeline_events (id, kind, timestamp, title, summary, agent_id, session_key, run_id, task_id, severity, payload)
         VALUES (@id, @kind, @timestamp, @title, @summary, @agentId, @sessionKey, @runId, @taskId, @severity, @payloadJson)
         ON CONFLICT(id) DO UPDATE SET
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
      .run({
        ...row,
        payloadJson: row.payload ? JSON.stringify(row.payload) : null,
      });
    return row;
  }

  listTimeline(limit = 200, kind?: TimelineEventKind): TimelineEvent[] {
    const rows = kind
      ? this.db
          .prepare(`SELECT * FROM timeline_events WHERE kind = ? ORDER BY timestamp DESC LIMIT ?`)
          .all(kind, limit)
      : this.db.prepare(`SELECT * FROM timeline_events ORDER BY timestamp DESC LIMIT ?`).all(limit);
    return (rows as Record<string, unknown>[]).map(mapTimelineRow).reverse();
  }

  appendAudit(entry: Omit<AuditLogEntry, "id"> & { id?: string }): AuditLogEntry {
    const row: AuditLogEntry = { id: entry.id ?? randomUUID(), ...entry };
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
    return row;
  }

  listAudit(limit = 100): AuditLogEntry[] {
    const rows = this.db.prepare(`SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?`).all(limit);
    return (rows as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      timestamp: String(r.timestamp),
      actor: String(r.actor),
      method: String(r.method),
      paramsSummary: String(r.params_summary),
      success: Boolean(r.success),
      error: r.error ? String(r.error) : undefined,
      resultSummary: r.result_summary ? String(r.result_summary) : undefined,
    }));
  }

  saveSnapshot(snapshot: RuntimeSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO snapshots (id, data, updated_at) VALUES (1, @data, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run({ data: JSON.stringify(snapshot), updatedAt: snapshot.updatedAt });
  }

  getSnapshot(): RuntimeSnapshot | null {
    const row = this.db.prepare(`SELECT data FROM snapshots WHERE id = 1`).get() as { data?: string } | undefined;
    if (!row?.data) return null;
    return JSON.parse(row.data) as RuntimeSnapshot;
  }

  close(): void {
    this.db.close();
  }
}

function mapTimelineRow(r: Record<string, unknown>): TimelineEvent {
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
    severity: r.severity as TimelineEvent["severity"],
    payload: r.payload ? (JSON.parse(String(r.payload)) as Record<string, unknown>) : undefined,
  };
}
