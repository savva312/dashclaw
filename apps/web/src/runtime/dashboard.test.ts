import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot, TimelineEvent } from "@dashclaw/runtime-model";
import { buildDashboardModel, buildTaskDetailModel } from "./dashboard";

const now = Date.parse("2026-06-22T12:00:00.000Z");

function snapshot(overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  return {
    gatewayId: "gateway-local",
    connectionState: "connected",
    health: { ok: true, uptimeMs: 10_000, version: "test" },
    agents: [
      { id: "agent-a", name: "Builder", model: "gpt-test" },
      { id: "agent-b", name: "Reviewer", model: "gpt-test" },
    ],
    sessions: [],
    tasks: [],
    cronJobs: [],
    approvals: [],
    nodes: [],
    activeRunCount: 0,
    pendingApprovalCount: 0,
    failedTaskCount: 0,
    updatedAt: "2026-06-22T11:59:55.000Z",
    ...overrides,
  };
}

describe("dashboard selectors", () => {
  it("groups running task work by agent and links related session", () => {
    const model = buildDashboardModel(
      snapshot({
        sessions: [
          {
            key: "session:agent:dashboard:abc",
            agentId: "agent-a",
            label: "Dashboard build",
            isActive: true,
            currentRunId: "run-1",
            currentTool: "pnpm test",
            updatedAt: "2026-06-22T11:59:50.000Z",
          },
        ],
        tasks: [
          {
            id: "task-1",
            status: "running",
            title: "Build dashboard",
            agentId: "agent-a",
            sessionKey: "session:agent:dashboard:abc",
            runId: "run-1",
            startedAt: "2026-06-22T11:55:00.000Z",
          },
        ],
      }),
      [],
      { nowMs: now },
    );

    expect(model.summary.workingAgents).toBe(1);
    expect(model.activeWork).toHaveLength(1);
    expect(model.activeWork[0]).toMatchObject({
      id: "task:task-1",
      label: "Build dashboard",
      status: "running",
      currentTool: "pnpm test",
    });
    expect(model.activeWork[0]?.links).toMatchObject({
      agent: "/agents/agent-a",
      session: "/agents/agent-a/sessions/session%3Aagent%3Adashboard%3Aabc",
      task: "/tasks/task-1",
    });
    expect(model.agents[0]?.agent.id).toBe("agent-a");
    expect(model.agents[0]?.state).toBe("working");
  });

  it("surfaces failures, pending approvals, stale sessions, and gateway issues as attention", () => {
    const model = buildDashboardModel(
      snapshot({
        connectionState: "reconnecting",
        health: { ok: true, degraded: true },
        updatedAt: "2026-06-22T11:58:00.000Z",
        sessions: [
          {
            key: "session:agent:subagent:def",
            agentId: "agent-a",
            isActive: true,
            updatedAt: "2026-06-22T11:45:00.000Z",
          },
        ],
        tasks: [
          {
            id: "task-failed",
            status: "failed",
            title: "Broken task",
            agentId: "agent-a",
            sessionKey: "session:agent:subagent:def",
            endedAt: "2026-06-22T11:56:00.000Z",
            error: "boom",
          },
          {
            id: "task-long",
            status: "running",
            title: "Long task",
            agentId: "agent-b",
            startedAt: "2026-06-22T11:00:00.000Z",
          },
        ],
        approvals: [
          {
            id: "approval-1",
            kind: "exec",
            status: "pending",
            command: "pnpm build",
            agentId: "agent-b",
            requestedAt: "2026-06-22T11:57:00.000Z",
          },
        ],
      }),
      [],
      { nowMs: now },
    );

    expect(model.isLive).toBe(false);
    expect(model.isStale).toBe(true);
    expect(model.summary.attentionItems).toBeGreaterThanOrEqual(6);
    expect(model.attention.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "gateway",
        "health",
        "stale-snapshot",
        "task-failed",
        "approval",
        "long-running-task",
        "stale-active-session",
      ]),
    );
    expect(model.attention[0]?.tone).toBe("error");
  });

  it("keeps active sessions without tasks visible as work", () => {
    const model = buildDashboardModel(
      snapshot({
        sessions: [
          {
            key: "session:agent:discord:channel:message",
            agentId: "agent-a",
            label: "Discord help",
            isActive: true,
            updatedAt: "2026-06-22T11:59:50.000Z",
          },
        ],
      }),
      [],
      { nowMs: now },
    );

    expect(model.activeWork).toHaveLength(1);
    expect(model.activeWork[0]).toMatchObject({
      id: "session:session:agent:discord:channel:message",
      label: "Discord help",
      status: "active-session",
    });
  });

  it("builds task details from task, session, agent, and related events", () => {
    const events: TimelineEvent[] = [
      {
        id: "event-task",
        kind: "session.tool",
        timestamp: "2026-06-22T11:59:00.000Z",
        title: "Tool ran",
        taskId: "task-1",
      },
      {
        id: "event-noise",
        kind: "heartbeat",
        timestamp: "2026-06-22T11:59:30.000Z",
        title: "Heartbeat",
        taskId: "task-1",
      },
      {
        id: "event-agent",
        kind: "agent.assistant",
        timestamp: "2026-06-22T11:58:00.000Z",
        title: "Agent update",
        agentId: "agent-a",
      },
    ];
    const detail = buildTaskDetailModel(
      snapshot({
        sessions: [{ key: "session-1", agentId: "agent-a", isActive: true }],
        tasks: [
          {
            id: "task-1",
            status: "running",
            agentId: "agent-a",
            sessionKey: "session-1",
          },
        ],
      }),
      events,
      "task-1",
    );

    expect(detail?.agent?.id).toBe("agent-a");
    expect(detail?.session?.key).toBe("session-1");
    expect(detail?.events.map((event) => event.id)).toEqual(["event-task", "event-agent"]);
    expect(detail?.links).toMatchObject({
      agent: "/agents/agent-a",
      session: "/agents/agent-a/sessions/session-1",
      task: "/tasks/task-1",
    });
  });
});
