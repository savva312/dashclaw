import Database from "better-sqlite3";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RUNTIME_LIMITS } from "@dashclaw/runtime-model";
import { RuntimeStore, StorageLimitError } from "./runtime-store.js";

const SENTINEL = "SEC005_SQLITE_SENTINEL";
const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("RuntimeStore timeline upsert", () => {
  it("persists one coherent row for a growing assistant response", () => {
    const store = new RuntimeStore(":memory:");
    const timestamp = "2026-07-13T10:00:00.000Z";
    store.upsertTimeline({
      id: "assistant-response-1",
      kind: "agent.assistant",
      timestamp,
      title: "Assistant responding",
      summary: "Hello",
      sessionKey: "session-a",
    });
    store.upsertTimeline({
      id: "assistant-response-1",
      kind: "agent.assistant",
      timestamp: "2026-07-13T10:00:01.000Z",
      title: "Assistant response",
      summary: "Hello world",
      sessionKey: "session-a",
    });

    expect(store.listTimeline()).toEqual([
      expect.objectContaining({
        id: "assistant-response-1",
        timestamp,
        title: "Assistant response",
        summary: "Hello world",
      }),
    ]);
    expect(JSON.stringify(store.listTimeline())).not.toContain('"severity":null');
    store.close();
  });

  it("never writes sentinel values to SQLite sinks", () => {
    const dbPath = join(makeTempRoot(), "data", "runtime.db");
    const store = new RuntimeStore(dbPath);
    try {
      store.appendTimeline({
        kind: "session.message",
        timestamp: "2026-07-21T06:00:00.000Z",
        title: `Task password=${SENTINEL}`,
        summary: `Authorization: Bearer ${SENTINEL}`,
        payload: JSON.parse(`{"api_key":"${SENTINEL}","context":"kept"}`) as Record<string, unknown>,
      });
      store.appendAudit({
        timestamp: "2026-07-21T06:00:00.000Z",
        actor: "operator",
        method: "health",
        paramsSummary: `credentials=${SENTINEL}`,
        success: false,
        error: `AWS_SECRET_ACCESS_KEY=${SENTINEL}`,
        resultSummary: `Cookie: session=${SENTINEL}`,
      });
      store.saveSnapshot({
        gatewayId: "default",
        connectionState: "connected",
        health: {
          ok: false,
          raw: { authorization: SENTINEL, diagnostic: "gateway degraded" },
        },
        agents: [],
        sessions: [],
        tasks: [{
          id: "task-1",
          status: "failed",
          title: `api-key=${SENTINEL}`,
          error: `Bearer ${SENTINEL}`,
        }],
        cronJobs: [],
        approvals: [{
          id: "approval-1",
          kind: "exec",
          status: "pending",
          command: `deploy --session-token=${SENTINEL} --target staging`,
        }],
        nodes: [],
        activeRunCount: 0,
        pendingApprovalCount: 1,
        failedTaskCount: 1,
        updatedAt: "2026-07-21T06:00:00.000Z",
      });

      expect(JSON.stringify(store.listTimeline())).not.toContain(SENTINEL);
      expect(JSON.stringify(store.listAudit())).not.toContain(SENTINEL);
      expect(JSON.stringify(store.getSnapshot())).not.toContain(SENTINEL);
    } finally {
      store.close();
    }

    const db = new Database(dbPath, { readonly: true });
    try {
      const persisted = JSON.stringify({
        timeline: db.prepare("SELECT * FROM timeline_events").all(),
        audit: db.prepare("SELECT * FROM audit_log").all(),
        snapshot: db.prepare("SELECT * FROM snapshots").all(),
      });
      expect(persisted).not.toContain(SENTINEL);
      expect(persisted).toContain("gateway degraded");
      expect(persisted).toContain("--target staging");
    } finally {
      db.close();
    }
  });
});

describe("RuntimeStore limits and retention", () => {
  it("clamps unsafe list limits and transactionally retains newest rows", () => {
    const store = new RuntimeStore(":memory:", { maxTimelineRows: 3, maxAuditRows: 2 });
    for (let index = 0; index < 6; index += 1) {
      store.appendTimeline({
        id: `event-${index}`,
        kind: "health",
        timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        title: `Event ${index}`,
      });
      store.appendAudit({
        id: `audit-${index}`,
        timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        actor: "test",
        method: "health",
        paramsSummary: "{}",
        success: true,
      });
    }

    expect(store.listTimeline(100).map((event) => event.id)).toEqual([
      "event-3",
      "event-4",
      "event-5",
    ]);
    expect(store.listTimeline(-1)).toHaveLength(1);
    expect(store.listTimeline(Number.POSITIVE_INFINITY)).toHaveLength(3);
    expect(store.listAudit(100).map((entry) => entry.id)).toEqual(["audit-5", "audit-4"]);
    expect(store.getStorageHealth()).toMatchObject({
      timelineRows: 3,
      auditRows: 2,
      overHighWater: false,
    });
    store.close();
  });

  it("replaces oversized persisted payloads without echoing their contents", () => {
    const store = new RuntimeStore(":memory:");
    const marker = "OVERSIZED_PAYLOAD_MARKER";
    const event = store.appendTimeline({
      kind: "health",
      timestamp: new Date().toISOString(),
      title: "Oversized",
      payload: {
        first: `${marker}${"x".repeat(10_000)}`,
        second: "y".repeat(10_000),
      },
    });

    expect(event.payload).toEqual({
      truncated: true,
      reason: "payload exceeded storage limit",
    });
    expect(JSON.stringify(store.listTimeline())).not.toContain(marker);
    store.close();
  });

  it("treats an active assistant upsert as recent for retention", () => {
    const store = new RuntimeStore(":memory:", { maxTimelineRows: 2 });
    store.upsertTimeline({
      id: "active-response",
      kind: "agent.assistant",
      timestamp: "2026-01-01T00:00:00.000Z",
      title: "Assistant responding",
      summary: "partial",
    });
    store.appendTimeline({
      id: "newer-1",
      kind: "health",
      timestamp: "2026-01-02T00:00:00.000Z",
      title: "Health",
    });
    store.upsertTimeline({
      id: "active-response",
      kind: "agent.assistant",
      timestamp: "2026-01-01T00:00:01.000Z",
      title: "Assistant response",
      summary: "complete",
    });
    store.appendTimeline({
      id: "newer-2",
      kind: "health",
      timestamp: "2026-01-03T00:00:00.000Z",
      title: "Health",
    });

    expect(store.listTimeline().map((event) => event.id)).toEqual([
      "active-response",
      "newer-2",
    ]);
    store.close();
  });

  it("stops accepting writes at the configured storage high-water mark", () => {
    const store = new RuntimeStore(":memory:", { highWaterBytes: 1 });
    expect(() =>
      store.appendTimeline({
        kind: "health",
        timestamp: new Date().toISOString(),
        title: "Blocked",
      }),
    ).toThrow(StorageLimitError);
    expect(store.getStorageHealth().overHighWater).toBe(true);
    store.close();
  });

  it("keeps database use bounded in a dedicated directory under sustained ingestion", () => {
    const dbPath = join(makeTempRoot(), "data", "runtime.db");
    const store = new RuntimeStore(dbPath, { maxTimelineRows: 100 });
    const payload = {
      sample: "x".repeat(RUNTIME_LIMITS.storage.maxTimelinePayloadBytes - 100),
    };
    try {
      for (let index = 0; index < 500; index += 1) {
        store.appendTimeline({
          id: `load-${index}`,
          kind: "health",
          timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
          title: "Bounded load event",
          payload,
        });
      }
      const health = store.getStorageHealth();
      expect(health.timelineRows).toBe(100);
      expect(health.usedBytes).toBeLessThan(4 * 1024 * 1024);
    } finally {
      store.close();
    }
  });
});

describe("RuntimeStore file permissions", () => {
  it("creates data, database, WAL, and SHM paths owner-only under umask 000", () => {
    if (process.platform === "win32") return;

    const root = makeTempRoot();
    const dataDirectory = join(root, "custom-data");
    const dbPath = join(dataDirectory, "runtime.db");
    const store = withUmask(0o000, () => new RuntimeStore(dbPath));

    try {
      store.appendTimeline({
        kind: "health",
        timestamp: "2026-07-21T06:00:00.000Z",
        title: "permission test",
      });

      expect(modeOf(dataDirectory)).toBe(0o700);
      expect(modeOf(dbPath)).toBe(0o600);
      expect(modeOf(`${dbPath}-wal`)).toBe(0o600);
      expect(modeOf(`${dbPath}-shm`)).toBe(0o600);
    } finally {
      store.close();
    }
  });

  it("corrects existing permissions and preserves data across reopen", () => {
    if (process.platform === "win32") return;

    const root = makeTempRoot();
    const dataDirectory = join(root, "existing-data");
    const dbPath = join(dataDirectory, "runtime.db");
    mkdirSync(dataDirectory, { mode: 0o755 });

    const firstStore = withUmask(0o022, () => new RuntimeStore(dbPath));
    firstStore.appendTimeline({
      id: "preserved-row",
      kind: "health",
      timestamp: "2026-07-21T06:01:00.000Z",
      title: "keep this row",
    });
    firstStore.close();

    chmodSync(dataDirectory, 0o755);
    chmodSync(dbPath, 0o644);

    const reopenedStore = withUmask(0o022, () => new RuntimeStore(dbPath));
    try {
      expect(reopenedStore.listTimeline()).toEqual([
        expect.objectContaining({ id: "preserved-row", title: "keep this row" }),
      ]);
      reopenedStore.appendTimeline({
        kind: "health",
        timestamp: "2026-07-21T06:02:00.000Z",
        title: "reopen write",
      });

      expect(modeOf(dataDirectory)).toBe(0o700);
      expect(modeOf(dbPath)).toBe(0o600);
      expect(modeOf(`${dbPath}-wal`)).toBe(0o600);
      expect(modeOf(`${dbPath}-shm`)).toBe(0o600);
    } finally {
      reopenedStore.close();
    }
  });

  it("rejects database and sidecar symbolic links", () => {
    if (process.platform === "win32") return;

    const root = makeTempRoot();
    const dataDirectory = join(root, "data");
    mkdirSync(dataDirectory, { mode: 0o700 });
    const target = join(root, "target");
    const dbPath = join(dataDirectory, "runtime.db");
    mkdirSync(target);
    symlinkSync(target, dbPath);

    expect(() => new RuntimeStore(dbPath)).toThrow(/must not be symbolic links/);

    unlinkSync(dbPath);
    const store = new RuntimeStore(dbPath);
    store.close();
    symlinkSync(target, `${dbPath}-wal`);

    expect(() => new RuntimeStore(dbPath)).toThrow(/must not be symbolic links/);
  });

  it("rejects symbolic-link data directories and non-regular database targets", () => {
    if (process.platform === "win32") return;

    const root = makeTempRoot();
    const actualDirectory = join(root, "actual-data");
    const linkedDirectory = join(root, "linked-data");
    mkdirSync(actualDirectory, { mode: 0o700 });
    symlinkSync(actualDirectory, linkedDirectory);

    expect(() => new RuntimeStore(join(linkedDirectory, "runtime.db"))).toThrow(
      /parent directory must not be a symbolic link/,
    );

    const dataDirectory = join(root, "data");
    const dbPath = join(dataDirectory, "runtime.db");
    mkdirSync(dbPath, { recursive: true });
    expect(() => new RuntimeStore(dbPath)).toThrow(/must be regular files/);
  });

  it("does not chmod an existing non-dedicated custom directory", () => {
    if (process.platform === "win32") return;

    const root = makeTempRoot();
    const customDirectory = join(root, "shared");
    const dbPath = join(customDirectory, "runtime.db");
    mkdirSync(customDirectory, { mode: 0o755 });
    chmodSync(customDirectory, 0o755);
    writeFileSync(join(customDirectory, "unrelated.txt"), "keep");

    expect(() => new RuntimeStore(dbPath)).toThrow(/non-dedicated database directory/);
    expect(modeOf(customDirectory)).toBe(0o755);
  });
});

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "dashclaw-runtime-store-"));
  tempRoots.push(root);
  return root;
}

function modeOf(path: string): number {
  expect(existsSync(path)).toBe(true);
  return lstatSync(path).mode & 0o7777;
}

function withUmask<T>(mode: number, callback: () => T): T {
  const previous = process.umask(mode);
  try {
    return callback();
  } finally {
    process.umask(previous);
  }
}
