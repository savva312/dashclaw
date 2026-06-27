import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot } from "@dashclaw/runtime-model";
import { buildDashboardModel } from "./runtime/dashboard";

const degradedSnapshot: RuntimeSnapshot = {
  gatewayId: "gateway-local",
  connectionState: "connected",
  health: { ok: true, degraded: true, uptimeMs: 12345, version: "fake" },
  agents: [{ id: "main", name: "Main" }],
  sessions: [
    {
      key: "agent:main:degraded",
      agentId: "main",
      label: "Degraded gateway check",
      isActive: true,
      updatedAt: "2026-06-22T11:59:40.000Z",
    },
  ],
  tasks: [
    {
      id: "task-degraded",
      status: "running",
      title: "Verify degraded dashboard",
      agentId: "main",
      sessionKey: "agent:main:degraded",
      startedAt: "2026-06-22T11:50:00.000Z",
    },
  ],
  cronJobs: [],
  approvals: [],
  nodes: [],
  activeRunCount: 1,
  pendingApprovalCount: 0,
  failedTaskCount: 0,
  updatedAt: "2026-06-22T11:59:55.000Z",
};

describe("dashclaw web", () => {
  it("smoke-builds dashboard model for degraded fake gateway state", () => {
    const model = buildDashboardModel(degradedSnapshot, [], { nowMs: Date.parse("2026-06-22T12:00:00.000Z") });

    expect(model.isLive).toBe(false);
    expect(model.summary.activeWork).toBe(1);
    expect(model.attention.map((item) => item.kind)).toContain("health");
  });
});
