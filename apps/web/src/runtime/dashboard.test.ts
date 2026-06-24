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

  it("covers graph and intervention inbox fixture states for future selectors", () => {
    const model = buildDashboardModel(
      snapshot({
        agents: [
          { id: "main", name: "Main", model: "gpt-test" },
          { id: "worker", name: "Worker subagent", model: "gpt-test" },
          { id: "ops", name: "Ops", model: "gpt-test" },
          { id: "qa", name: "QA", model: "gpt-test" },
        ],
        sessions: [
          {
            key: "agent:main:release",
            agentId: "main",
            label: "Release orchestration",
            isActive: true,
            currentRunId: "run-release",
            currentTool: "git push",
            updatedAt: "2026-06-22T11:59:40.000Z",
          },
          {
            key: "agent:worker:subagent",
            agentId: "worker",
            label: "Subagent selector audit",
            isActive: true,
            currentRunId: "run-subagent",
            currentTool: "pnpm test",
            updatedAt: "2026-06-22T11:59:30.000Z",
          },
          {
            key: "agent:ops:approval",
            agentId: "ops",
            label: "Production approval",
            isActive: false,
            updatedAt: "2026-06-22T11:58:00.000Z",
          },
          {
            key: "agent:qa:failed",
            agentId: "qa",
            label: "Failed browser smoke",
            isActive: false,
            updatedAt: "2026-06-22T11:54:00.000Z",
          },
        ],
        tasks: [
          {
            id: "task-release",
            status: "running",
            title: "Release orchestration",
            agentId: "main",
            sessionKey: "agent:main:release",
            runId: "run-release",
            startedAt: "2026-06-22T11:20:00.000Z",
          },
          {
            id: "task-subagent-selectors",
            status: "running",
            kind: "subagent",
            title: "Subagent selector audit",
            agentId: "worker",
            sessionKey: "agent:worker:subagent",
            runId: "run-subagent",
            startedAt: "2026-06-22T11:57:00.000Z",
          },
          {
            id: "task-browser-failed",
            status: "failed",
            title: "Browser smoke failed",
            agentId: "qa",
            sessionKey: "agent:qa:failed",
            endedAt: "2026-06-22T11:55:00.000Z",
            error: "Playwright selector not found",
          },
          {
            id: "task-prod-timeout",
            status: "timed_out",
            title: "Production deploy timeout",
            agentId: "ops",
            sessionKey: "agent:ops:approval",
            startedAt: "2026-06-22T10:50:00.000Z",
            endedAt: "2026-06-22T11:40:00.000Z",
            error: "approval prompt expired",
          },
        ],
        approvals: [
          {
            id: "approval-restart",
            kind: "exec",
            status: "pending",
            command: "gateway.restart.request --reason deploy",
            agentId: "main",
            sessionKey: "agent:main:release",
            requestedAt: "2026-06-22T11:56:00.000Z",
          },
          {
            id: "approval-terraform",
            kind: "exec",
            status: "pending",
            command: "terraform apply -auto-approve",
            agentId: "ops",
            sessionKey: "agent:ops:approval",
            requestedAt: "2026-06-22T11:57:00.000Z",
          },
          {
            id: "approval-plugin",
            kind: "plugin",
            status: "pending",
            command: "deploy-plugin publish canary",
            agentId: "ops",
            sessionKey: "agent:ops:approval",
            requestedAt: "2026-06-22T11:58:00.000Z",
          },
        ],
      }),
      [],
      { nowMs: now },
    );

    expect(model.summary).toMatchObject({
      totalAgents: 4,
      workingAgents: 2,
      activeWork: 2,
      pendingApprovals: 3,
      failedTasks: 2,
    });
    expect(model.activeWork.map((item) => item.id)).toEqual(["task:task-release", "task:task-subagent-selectors"]);
    expect(model.agents.find((agent) => agent.agent.id === "worker")?.state).toBe("working");
    expect(model.agents.find((agent) => agent.agent.id === "ops")?.state).toBe("attention");

    const approval = model.attention.find((item) => item.id === "approval:approval-terraform");
    expect(approval?.links).toMatchObject({
      agent: "/agents/ops",
      session: "/agents/ops/sessions/agent%3Aops%3Aapproval",
      approval: "/approvals",
    });
    expect(model.attention.filter((item) => item.kind === "task-failed")).toHaveLength(2);
    expect(model.attention.some((item) => item.kind === "long-running-task" && item.task?.id === "task-release")).toBe(true);
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

  it("derives a live work graph with parent agent, subagent, ACP, cron, failed, and lost children", () => {
    const model = buildDashboardModel(
      snapshot({
        agents: [{ id: "agent-a", name: "Main Agent", model: "gpt-test" }],
        sessions: [
          {
            key: "agent:agent-a:discord:channel:root",
            agentId: "agent-a",
            label: "Discord parent",
            isActive: true,
            updatedAt: "2026-06-22T11:59:45.000Z",
          },
          {
            key: "agent:agent-a:subagent:child-1",
            agentId: "agent-a",
            label: "Subagent child",
            isActive: true,
            currentTool: "pnpm test",
            updatedAt: "2026-06-22T11:59:30.000Z",
          },
          {
            key: "agent:agent-a:acp:lane-1",
            agentId: "agent-a",
            label: "ACP lane",
            isActive: true,
            updatedAt: "2026-06-22T11:59:20.000Z",
          },
          {
            key: "agent:agent-a:cron:nightly",
            agentId: "agent-a",
            label: "Nightly cron",
            isActive: true,
            updatedAt: "2026-06-22T11:40:00.000Z",
          },
        ],
        tasks: [
          {
            id: "task-subagent",
            status: "running",
            title: "Implement slice",
            agentId: "agent-a",
            sessionKey: "agent:agent-a:subagent:child-1",
            startedAt: "2026-06-22T11:58:00.000Z",
          },
          {
            id: "task-acp-failed",
            status: "failed",
            title: "ACP handoff",
            agentId: "agent-a",
            sessionKey: "agent:agent-a:acp:lane-1",
            endedAt: "2026-06-22T11:58:30.000Z",
            error: "lost connection",
          },
        ],
        cronJobs: [
          {
            id: "nightly",
            name: "Nightly cron",
            enabled: true,
            schedule: "0 0 * * *",
            nextRunAt: "2026-06-23T00:00:00.000Z",
          },
        ],
      }),
      [
        {
          id: "event-parent-link",
          kind: "session.operation",
          timestamp: "2026-06-22T11:59:35.000Z",
          title: "Spawn subagent",
          sessionKey: "agent:agent-a:subagent:child-1",
          payload: { parentSessionKey: "agent:agent-a:discord:channel:root" },
        },
      ],
      { nowMs: now },
    );

    const agentRoot = model.workGraph.roots.find((node) => node.id === "agent:agent-a");
    const parentSession = agentRoot?.children.find((node) => node.id === "session:agent:agent-a:discord:channel:root");
    const subagent = parentSession?.children.find((node) => node.id === "session:agent:agent-a:subagent:child-1");
    const acp = agentRoot?.children.find((node) => node.id === "session:agent:agent-a:acp:lane-1");
    const cron = agentRoot?.children.find((node) => node.id === "session:agent:agent-a:cron:nightly");

    expect(model.workGraph.summary.children).toBe(7);
    expect(model.workGraph.summary.failed).toBe(1);
    expect(model.workGraph.summary.lost).toBe(1);
    expect(parentSession?.role).toBe("session");
    expect(subagent).toMatchObject({ role: "subagent", status: "active", currentTool: "pnpm test" });
    expect(subagent?.children[0]).toMatchObject({ kind: "task", status: "running" });
    expect(acp).toMatchObject({ role: "acp", status: "active" });
    expect(acp?.children[0]).toMatchObject({ kind: "task", status: "failed" });
    expect(cron).toMatchObject({ role: "cron", status: "lost" });
    expect(cron?.children[0]).toMatchObject({ kind: "cron", status: "scheduled" });
    expect(model.workGraph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "session:agent:agent-a:discord:channel:root", to: "session:agent:agent-a:subagent:child-1" }),
        expect.objectContaining({ from: "session:agent:agent-a:cron:nightly", to: "cron:nightly", kind: "scheduled" }),
      ]),
    );
  });

  it("builds a ranked intervention/access/security summary from runtime signals", () => {
    const model = buildDashboardModel(
      snapshot({
        connectionState: "disconnected",
        health: {
          ok: true,
          raw: {
            auth: { enabled: false },
            policy: { allowWritesWithoutApproval: true },
          },
        },
        nodes: [{ id: "phone", label: "Phone", platform: "ios", connected: false }],
        tasks: [
          {
            id: "lost-running",
            status: "running",
            title: "Lost runner",
            sessionKey: "missing-session",
            startedAt: "2026-06-22T11:50:00.000Z",
          },
          {
            id: "failed-recent",
            status: "failed",
            title: "Recent failure",
            endedAt: "2026-06-22T11:59:00.000Z",
          },
        ],
        approvals: [
          {
            id: "risky-approval",
            kind: "exec",
            status: "pending",
            command: "sudo rm -rf /tmp/example",
            requestedAt: "2026-06-22T11:58:00.000Z",
          },
        ],
      }),
      [],
      { nowMs: now },
    );

    expect(model.interventionSummary.tone).toBe("error");
    expect(model.interventionSummary.counts).toMatchObject({
      access: 2,
      security: 3,
      intervention: 2,
    });
    expect(model.attention.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["gateway", "security-posture", "approval", "task-failed", "lost-task", "access"]),
    );
    expect(model.attention[0]).toMatchObject({ kind: "gateway", category: "access", tone: "error" });
    expect(model.attention.find((item) => item.id === "approval:risky-approval")).toMatchObject({
      category: "security",
      tone: "error",
      title: "High-risk approval pending",
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
