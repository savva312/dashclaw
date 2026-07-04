import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot, TimelineEvent } from "@dashclaw/runtime-model";
import { buildDashboardModel, buildTaskDetailModel, buildThreadSessionMapModel } from "./dashboard";

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

  it("summarizes empty, disconnected, degraded, and stale dashboard states", () => {
    const empty = buildDashboardModel(
      snapshot({ agents: [], health: { ok: true }, updatedAt: "2026-06-22T11:59:55.000Z" }),
      [],
      { nowMs: now },
    );
    expect(empty.runtimeStatus).toMatchObject({ tone: "info", label: "No runtime work yet", empty: true });
    expect(empty.isLive).toBe(true);

    const disconnected = buildDashboardModel(
      snapshot({ connectionState: "disconnected", updatedAt: "2026-06-22T11:59:55.000Z" }),
      [],
      { nowMs: now },
    );
    expect(disconnected.runtimeStatus).toMatchObject({ tone: "error", label: "Gateway disconnected" });
    expect(disconnected.attention.map((item) => item.kind)).toContain("gateway");

    const degraded = buildDashboardModel(
      snapshot({ health: { ok: true, degraded: true }, updatedAt: "2026-06-22T11:59:55.000Z" }),
      [],
      { nowMs: now },
    );
    expect(degraded.runtimeStatus).toMatchObject({ tone: "warn", label: "Gateway degraded" });
    expect(degraded.isLive).toBe(false);

    const stale = buildDashboardModel(
      snapshot({ updatedAt: "2026-06-22T11:58:00.000Z" }),
      [],
      { nowMs: now },
    );
    expect(stale.runtimeStatus).toMatchObject({ tone: "warn", label: "Snapshot stale" });
    expect(stale.isStale).toBe(true);
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
          {
            id: "task-complete",
            status: "completed",
            title: "Docs update completed",
            agentId: "main",
            sessionKey: "agent:main:release",
            startedAt: "2026-06-22T11:10:00.000Z",
            endedAt: "2026-06-22T11:52:00.000Z",
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
    expect(model.controlCenter.activeNow.map((item) => item.id)).toEqual(["task:task-release", "task:task-subagent-selectors"]);
    expect(model.controlCenter.waitingOnMe.map((item) => item.id)).toEqual([
      "approval:approval-plugin",
      "approval:approval-terraform",
      "approval:approval-restart",
    ]);
    expect(model.controlCenter.failedRecoverable.map((item) => item.id)).toEqual([
      "task:task-browser-failed",
      "task:task-prod-timeout",
    ]);
    expect(model.controlCenter.recentlyCompleted[0]).toMatchObject({
      id: "task:task-complete",
      lane: "recentlyCompleted",
      tone: "ok",
      nextAction: "No action needed; open details if context is useful.",
    });
    expect(model.controlCenter.attention.some((item) => item.id === "task-long-running:task-release")).toBe(true);
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
            parentSessionKey: "agent:agent-a:discord:channel:root",
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
      [],
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

  it("summarizes a Discord-thread workflow fixture with active, waiting, completed, failed, and hidden work", () => {
    const mainChannel = "agent:dashclaw:discord:channel:1519213500986036264";
    const workBoardThread = "agent:dashclaw:discord:thread:work-board";
    const subagentSession = "agent:fixture-model:subagent:TASK-039-fixture-model-lane";
    const acpSession = "agent:coder:acp:TASK-039-coding-lane";
    const completedThread = "agent:dashclaw:discord:thread:completed-summary";
    const failedThread = "agent:dashclaw:discord:thread:failed-delivery";
    const archivedThread = "agent:dashclaw:discord:thread:archived-context";

    const model = buildDashboardModel(
      snapshot({
        agents: [
          { id: "dashclaw", name: "Dashclaw", model: "gpt-test" },
          { id: "fixture-model", name: "Fixture Model Lane", model: "gpt-test" },
          { id: "coder", name: "ACP Coding Lane", model: "gpt-test" },
          { id: "ops", name: "Ops Watch", model: "gpt-test" },
        ],
        sessions: [
          {
            key: mainChannel,
            agentId: "dashclaw",
            label: "#dashclaw / main discussion",
            status: "running",
            isActive: true,
            currentRunId: "run-channel-main",
            updatedAt: "2026-06-22T11:59:45.000Z",
          },
          {
            key: workBoardThread,
            agentId: "dashclaw",
            label: "thread: implement work board",
            status: "running",
            isActive: true,
            parentSessionKey: mainChannel,
            currentRunId: "run-thread-work-board",
            updatedAt: "2026-06-22T11:59:30.000Z",
          },
          {
            key: subagentSession,
            agentId: "fixture-model",
            label: "TASK-039 fixture/model lane",
            status: "running",
            isActive: true,
            parentSessionKey: workBoardThread,
            currentRunId: "run-subagent-fixture",
            currentTool: "pnpm test",
            updatedAt: "2026-06-22T11:59:20.000Z",
          },
          {
            key: acpSession,
            agentId: "coder",
            label: "ACP lane: fixture extension",
            status: "queued",
            isActive: true,
            parentSessionKey: workBoardThread,
            currentRunId: "run-acp-fixture",
            updatedAt: "2026-06-22T11:59:00.000Z",
          },
          {
            key: completedThread,
            agentId: "dashclaw",
            label: "thread: completed fixture summary",
            status: "completed",
            isActive: false,
            parentSessionKey: mainChannel,
            updatedAt: "2026-06-22T11:50:00.000Z",
          },
          {
            key: failedThread,
            agentId: "dashclaw",
            label: "thread: investigate failed delivery",
            status: "failed",
            isActive: false,
            parentSessionKey: mainChannel,
            updatedAt: "2026-06-22T11:53:00.000Z",
          },
          {
            key: archivedThread,
            agentId: "dashclaw",
            label: "thread: archived context",
            status: "completed",
            isActive: false,
            parentSessionKey: mainChannel,
            updatedAt: "2026-06-22T10:00:00.000Z",
          },
        ],
        tasks: [
          {
            id: "task-discord-main-triage",
            status: "running",
            title: "Coordinate Discord workflow triage",
            agentId: "dashclaw",
            sessionKey: mainChannel,
            runId: "run-channel-main",
            startedAt: "2026-06-22T11:55:00.000Z",
          },
          {
            id: "task-work-board",
            status: "running",
            title: "Implement work board fixture",
            agentId: "dashclaw",
            sessionKey: workBoardThread,
            runId: "run-thread-work-board",
            startedAt: "2026-06-22T11:20:00.000Z",
          },
          {
            id: "task-fixture-model-lane",
            status: "running",
            kind: "subagent",
            title: "Inspect fake gateway runtime model",
            agentId: "fixture-model",
            sessionKey: subagentSession,
            runId: "run-subagent-fixture",
            startedAt: "2026-06-22T11:57:00.000Z",
          },
          {
            id: "task-acp-review",
            status: "queued",
            kind: "acp",
            title: "Review fixture extension",
            agentId: "coder",
            sessionKey: acpSession,
            runId: "run-acp-fixture",
            startedAt: "2026-06-22T11:58:00.000Z",
          },
          {
            id: "task-thread-summary",
            status: "completed",
            title: "Publish fixture summary to thread",
            agentId: "dashclaw",
            sessionKey: completedThread,
            runId: "run-thread-summary",
            startedAt: "2026-06-22T11:40:00.000Z",
            endedAt: "2026-06-22T11:48:00.000Z",
          },
          {
            id: "task-failed-delivery",
            status: "failed",
            title: "Investigate failed delivery",
            agentId: "dashclaw",
            sessionKey: failedThread,
            runId: "run-failed-delivery",
            endedAt: "2026-06-22T11:54:00.000Z",
            error: "Discord result delivery failed after thread handoff",
          },
          {
            id: "task-lost-background-result",
            status: "timed_out",
            kind: "subagent",
            title: "Recover orphaned subagent result",
            agentId: "fixture-model",
            sessionKey: "agent:fixture-model:subagent:missing-delivery",
            runId: "run-lost-result",
            startedAt: "2026-06-22T10:30:00.000Z",
            endedAt: "2026-06-22T11:30:00.000Z",
            error: "parent thread unavailable before result delivery",
          },
        ],
        approvals: [
          {
            id: "approval-discord-thread-test",
            kind: "exec",
            status: "pending",
            command: "pnpm --filter @dashclaw/web test -- dashboard.test.ts",
            agentId: "coder",
            sessionKey: acpSession,
            requestedAt: "2026-06-22T11:58:30.000Z",
          },
        ],
      }),
      [],
      { nowMs: now },
    );

    expect(model.summary).toMatchObject({
      totalAgents: 4,
      workingAgents: 3,
      activeWork: 4,
      pendingApprovals: 1,
      failedTasks: 2,
    });
    expect(model.activeWork.filter((item) => item.status === "queued")).toHaveLength(1);
    expect(model.activeWork.map((item) => item.id)).toEqual([
      "task:task-discord-main-triage",
      "task:task-work-board",
      "task:task-fixture-model-lane",
      "task:task-acp-review",
    ]);
    expect(model.workGraph.summary).toMatchObject({ children: 13, active: 8, failed: 2, lost: 1, hiddenInactive: 5 });
    expect(model.workGraph.nodes.filter((node) => node.status === "completed")).toHaveLength(2);
    expect(model.attention.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["approval", "task-failed", "long-running-task"]),
    );
    expect(model.workGraph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: `session:${mainChannel}`, to: `session:${workBoardThread}` }),
        expect.objectContaining({ from: `session:${workBoardThread}`, to: `session:${subagentSession}` }),
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

  it("derives work board items by Discord thread while preserving partial lineage", () => {
    const channel = "agent:dashclaw:discord:channel:1519213500986036264";
    const activeThread = "agent:dashclaw:discord:thread:work-board-active";
    const activeSubagent = "agent:worker:subagent:work-board-selectors";
    const waitingThread = "agent:dashclaw:discord:thread:needs-approval";
    const reviewThread = "agent:dashclaw:discord:thread:needs-review";
    const doneThread = "agent:dashclaw:discord:thread:done-summary";

    const model = buildDashboardModel(
      snapshot({
        agents: [
          { id: "dashclaw", name: "Dashclaw", model: "gpt-test" },
          { id: "worker", name: "Selector Worker", model: "gpt-test" },
        ],
        sessions: [
          {
            key: channel,
            agentId: "dashclaw",
            label: "#dashclaw",
            isActive: false,
            updatedAt: "2026-06-22T11:30:00.000Z",
          },
          {
            key: activeThread,
            agentId: "dashclaw",
            label: "thread: TASK-034 Work Board",
            isActive: true,
            parentSessionKey: channel,
            updatedAt: "2026-06-22T11:59:00.000Z",
          },
          {
            key: activeSubagent,
            agentId: "worker",
            label: "TASK-034 selector lane",
            isActive: true,
            parentSessionKey: activeThread,
            currentTool: "pnpm test",
            updatedAt: "2026-06-22T11:59:20.000Z",
          },
          {
            key: waitingThread,
            agentId: "dashclaw",
            label: "thread: deploy approval",
            isActive: false,
            parentSessionKey: channel,
            updatedAt: "2026-06-22T11:58:00.000Z",
          },
          {
            key: reviewThread,
            agentId: "dashclaw",
            label: "thread: review release notes",
            status: "needs_review",
            isActive: false,
            parentSessionKey: channel,
            updatedAt: "2026-06-22T11:54:00.000Z",
          },
          {
            key: doneThread,
            agentId: "dashclaw",
            label: "thread: completed docs",
            status: "completed",
            isActive: false,
            parentSessionKey: channel,
            updatedAt: "2026-06-22T11:45:00.000Z",
          },
        ],
        tasks: [
          {
            id: "task-work-board-parent",
            status: "running",
            title: "Build work board selectors",
            agentId: "dashclaw",
            sessionKey: activeThread,
            runId: "run-work-board",
            startedAt: "2026-06-22T11:50:00.000Z",
          },
          {
            id: "task-work-board-subagent",
            status: "running",
            kind: "subagent",
            title: "Audit selector fixture",
            agentId: "worker",
            sessionKey: activeSubagent,
            runId: "run-selector-worker",
            startedAt: "2026-06-22T11:55:00.000Z",
          },
          {
            id: "task-new-inbox",
            status: "queued",
            title: "Queued without a session yet",
            agentId: "dashclaw",
          },
          {
            id: "task-done-summary",
            status: "completed",
            title: "Publish completed summary",
            agentId: "dashclaw",
            sessionKey: doneThread,
            startedAt: "2026-06-22T11:40:00.000Z",
            endedAt: "2026-06-22T11:44:00.000Z",
          },
          {
            id: "task-orphaned-failure",
            status: "failed",
            title: "Recover orphaned Discord result",
            agentId: "worker",
            sessionKey: "agent:worker:subagent:missing-result",
            endedAt: "2026-06-22T11:57:00.000Z",
            error: "child result arrived after parent thread disappeared",
          },
        ],
        approvals: [
          {
            id: "approval-deploy",
            kind: "exec",
            status: "pending",
            command: "pnpm deploy --dry-run",
            agentId: "dashclaw",
            sessionKey: waitingThread,
            requestedAt: "2026-06-22T11:58:30.000Z",
          },
        ],
      }),
      [
        {
          id: "event-worker-progress",
          kind: "agent.tool",
          timestamp: "2026-06-22T11:59:30.000Z",
          title: "Worker ran tests",
          summary: "Selector worker finished one assertion pass.",
          sessionKey: activeSubagent,
          taskId: "task-work-board-subagent",
        },
      ],
      { nowMs: now },
    );

    expect(model.workBoard.summary).toMatchObject({ inbox: 1, active: 1, waiting: 1, review: 1, done: 1, failed: 1 });
    expect(model.workBoard.columns.map((column) => column.id)).toEqual(["inbox", "active", "waiting", "review", "done", "failed"]);

    const active = model.workBoard.items.find((item) => item.id === `session:${activeThread}`);
    expect(active).toMatchObject({
      title: "TASK-034 Work Board",
      state: "active",
      tone: "ok",
      currentAction: "pnpm test",
      lineage: { quality: "complete" },
    });
    expect(active?.evidence.sessions.map((session) => session.key)).toEqual([activeSubagent, activeThread]);
    expect(active?.evidence.tasks.map((task) => task.id)).toEqual(["task-work-board-subagent", "task-work-board-parent"]);
    expect(active?.evidence.events.map((event) => event.id)).toEqual(["event-worker-progress"]);

    expect(model.workBoard.items.find((item) => item.id === `session:${waitingThread}`)).toMatchObject({
      state: "waiting",
      summary: "pnpm deploy --dry-run",
      links: { approval: "/approvals" },
    });
    expect(model.workBoard.items.find((item) => item.id === `session:${reviewThread}`)?.state).toBe("review");
    expect(model.workBoard.items.find((item) => item.id === `session:${doneThread}`)?.state).toBe("done");

    const orphaned = model.workBoard.items.find((item) => item.id === "task:task-orphaned-failure");
    expect(orphaned).toMatchObject({
      state: "failed",
      tone: "error",
      lineage: { quality: "partial" },
    });
    expect(orphaned?.lineage.diagnostic).toContain("missing session");
  });

  it("keeps completed, cancelled, and failed terminal work available for review", () => {
    const model = buildDashboardModel(
      snapshot({
        tasks: [
          {
            id: "task-completed-review",
            status: "completed",
            title: "Delivered result summary",
            agentId: "agent-a",
            startedAt: "2026-06-22T11:20:00.000Z",
            endedAt: "2026-06-22T11:50:00.000Z",
          },
          {
            id: "task-cancelled-review",
            status: "cancelled",
            title: "Cancelled obsolete branch",
            agentId: "agent-a",
            startedAt: "2026-06-22T11:30:00.000Z",
            endedAt: "2026-06-22T11:55:00.000Z",
          },
          {
            id: "task-failed-review",
            status: "failed",
            title: "Failed delivery recovery",
            agentId: "agent-b",
            endedAt: "2026-06-22T11:58:00.000Z",
            error: "result delivery failed",
          },
        ],
      }),
      [
        {
          id: "event-delivered-result",
          kind: "agent.assistant",
          timestamp: "2026-06-22T11:51:00.000Z",
          title: "Result delivered",
          summary: "Final summary was delivered back to Discord.",
          taskId: "task-completed-review",
          agentId: "agent-a",
        },
      ],
      { nowMs: now },
    );

    expect(model.controlCenter.recentlyCompleted.map((item) => item.id)).toEqual([
      "task:task-cancelled-review",
      "task:task-completed-review",
    ]);
    expect(model.controlCenter.failedRecoverable.map((item) => item.id)).toEqual(["task:task-failed-review"]);

    const completed = model.workBoard.items.find((item) => item.id === "task:task-completed-review");
    const cancelled = model.workBoard.items.find((item) => item.id === "task:task-cancelled-review");
    const failed = model.workBoard.items.find((item) => item.id === "task:task-failed-review");

    expect(completed).toMatchObject({ state: "done", summary: "Final summary was delivered back to Discord." });
    expect(completed?.evidence.events.map((event) => event.id)).toEqual(["event-delivered-result"]);
    expect(cancelled).toMatchObject({ state: "done", summary: "Cancelled obsolete branch cancelled." });
    expect(failed).toMatchObject({ state: "failed", summary: "result delivery failed" });
  });

  it("builds a thread/session map for Discord source lookup and lineage diagnostics", () => {
    const channel = "agent:dashclaw:discord:channel:1519213500986036264";
    const activeThread = "agent:dashclaw:discord:thread:TASK-035-map";
    const subagentSession = "agent:worker:subagent:TASK-035-selector-lane";
    const waitingThread = "agent:dashclaw:discord:thread:needs-approval";
    const archivedThread = "agent:dashclaw:discord:thread:archived-context";

    const model = buildThreadSessionMapModel(
      snapshot({
        agents: [
          { id: "dashclaw", name: "Dashclaw", model: "gpt-test" },
          { id: "worker", name: "Selector Worker", model: "gpt-test" },
        ],
        sessions: [
          {
            key: channel,
            agentId: "dashclaw",
            label: "#dashclaw",
            isActive: false,
            updatedAt: "2026-06-22T11:30:00.000Z",
          },
          {
            key: activeThread,
            agentId: "dashclaw",
            label: "thread: TASK-035 thread/session map",
            isActive: true,
            parentSessionKey: channel,
            currentRunId: "run-thread-map",
            updatedAt: "2026-06-22T11:59:00.000Z",
          },
          {
            key: subagentSession,
            agentId: "worker",
            label: "TASK-035 selector lane",
            isActive: true,
            parentSessionKey: activeThread,
            currentRunId: "run-selector-lane",
            currentTool: "pnpm test",
            updatedAt: "2026-06-22T11:59:20.000Z",
          },
          {
            key: waitingThread,
            agentId: "dashclaw",
            label: "thread: approval handoff",
            isActive: false,
            parentSessionKey: channel,
            updatedAt: "2026-06-22T11:58:00.000Z",
          },
          {
            key: archivedThread,
            agentId: "dashclaw",
            label: "thread: archived context",
            status: "archived",
            isActive: false,
            parentSessionKey: channel,
            updatedAt: "2026-06-22T09:00:00.000Z",
          },
        ],
        tasks: [
          {
            id: "task-map-parent",
            status: "running",
            title: "Build thread/session map selector",
            agentId: "dashclaw",
            sessionKey: activeThread,
            runId: "run-thread-map",
            startedAt: "2026-06-22T11:50:00.000Z",
          },
          {
            id: "task-map-subagent",
            status: "running",
            kind: "subagent",
            title: "Audit selector/model lane",
            agentId: "worker",
            sessionKey: subagentSession,
            runId: "run-selector-lane",
            startedAt: "2026-06-22T11:55:00.000Z",
          },
          {
            id: "task-orphaned-thread",
            status: "timed_out",
            title: "Recover missing Discord thread",
            agentId: "worker",
            sessionKey: "agent:dashclaw:discord:thread:missing-original",
            runId: "run-missing-thread",
            startedAt: "2026-06-22T10:30:00.000Z",
            endedAt: "2026-06-22T11:30:00.000Z",
            error: "parent thread missing from snapshot",
          },
        ],
        approvals: [
          {
            id: "approval-map-test",
            kind: "exec",
            status: "pending",
            command: "pnpm --filter @dashclaw/web test -- dashboard.test.ts",
            agentId: "dashclaw",
            sessionKey: waitingThread,
            requestedAt: "2026-06-22T11:58:30.000Z",
          },
        ],
      }),
      [],
      { nowMs: now },
    );

    expect(model.summary).toMatchObject({ channels: 1, threads: 3, sessions: 1, orphanedTasks: 1 });
    expect(model.metadataGaps).toContain(
      "Discord source metadata is inferred from session keys because channel/thread ids, archive state, and permalinks are not normalized in RuntimeSnapshot.",
    );

    const thread = model.entries.find((entry) => entry.id === `session:${activeThread}`);
    expect(thread).toMatchObject({
      source: { kind: "thread", label: "TASK-035 thread/session map", threadId: "TASK-035-map" },
      parentSession: { key: channel },
      state: "active",
      tone: "ok",
      lineage: { quality: "partial" },
    });
    expect(thread?.childSessions.map((session) => session.key)).toEqual([subagentSession]);
    expect(thread?.tasks.map((task) => task.id)).toEqual(["task-map-subagent", "task-map-parent"]);
    expect(thread?.runIds).toEqual(["run-selector-lane", "run-thread-map"]);
    expect(thread?.agents.map((agent) => agent.id)).toEqual(["dashclaw", "worker"]);
    expect(thread?.links).toMatchObject({
      agent: "/agents/dashclaw",
      session: `/agents/dashclaw/sessions/${encodeURIComponent(activeThread)}`,
      task: "/tasks/task-map-subagent",
    });

    expect(model.entries.find((entry) => entry.id === `session:${waitingThread}`)).toMatchObject({
      state: "waiting",
      approvals: [expect.objectContaining({ id: "approval-map-test" })],
      links: { approval: "/approvals" },
    });
    expect(model.entries.find((entry) => entry.id === `session:${archivedThread}`)?.state).toBe("archived");

    const orphaned = model.entries.find((entry) => entry.id === "task:task-orphaned-thread");
    expect(orphaned).toMatchObject({
      source: { kind: "task" },
      state: "failed",
      tone: "error",
      lineage: { quality: "partial" },
    });
    expect(orphaned?.lineage.diagnostic).toContain("missing session");
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

  it("builds a review queue for completed, failed, cancelled, delivered, and since-last-seen work", () => {
    const doneSession = "agent:dashclaw:discord:thread:done-review";
    const failedSession = "agent:dashclaw:discord:thread:failed-review";
    const cancelledSession = "agent:dashclaw:discord:thread:cancelled-review";
    const changedSession = "agent:dashclaw:discord:thread:changed-review";

    const model = buildDashboardModel(
      snapshot({
        agents: [{ id: "dashclaw", name: "Dashclaw", model: "gpt-test" }],
        sessions: [
          {
            key: doneSession,
            agentId: "dashclaw",
            label: "thread: completed result",
            status: "completed",
            isActive: false,
            updatedAt: "2026-06-22T11:53:00.000Z",
          },
          {
            key: failedSession,
            agentId: "dashclaw",
            label: "thread: failed result",
            status: "failed",
            isActive: false,
            updatedAt: "2026-06-22T11:54:00.000Z",
          },
          {
            key: cancelledSession,
            agentId: "dashclaw",
            label: "thread: cancelled result",
            isActive: false,
            updatedAt: "2026-06-22T11:55:00.000Z",
          },
          {
            key: changedSession,
            agentId: "dashclaw",
            label: "thread: changed while away",
            isActive: false,
            updatedAt: "2026-06-22T11:56:00.000Z",
          },
        ],
        tasks: [
          {
            id: "task-delivered",
            status: "completed",
            title: "Publish final summary",
            agentId: "dashclaw",
            sessionKey: doneSession,
            startedAt: "2026-06-22T11:40:00.000Z",
            endedAt: "2026-06-22T11:52:00.000Z",
          },
          {
            id: "task-review-failed",
            status: "failed",
            title: "Deliver result",
            agentId: "dashclaw",
            sessionKey: failedSession,
            endedAt: "2026-06-22T11:54:00.000Z",
            error: "Discord result delivery failed",
          },
          {
            id: "task-cancelled",
            status: "cancelled",
            title: "Cancelled duplicate run",
            agentId: "dashclaw",
            sessionKey: cancelledSession,
            endedAt: "2026-06-22T11:55:00.000Z",
          },
          {
            id: "task-old-done",
            status: "completed",
            title: "Old completed work",
            agentId: "dashclaw",
            sessionKey: changedSession,
            startedAt: "2026-06-22T11:20:00.000Z",
            endedAt: "2026-06-22T11:25:00.000Z",
          },
        ],
      }),
      [
        {
          id: "event-delivered",
          kind: "agent.assistant",
          timestamp: "2026-06-22T11:53:30.000Z",
          title: "Result delivered",
          summary: "Final summary posted back to Discord.",
          sessionKey: doneSession,
          taskId: "task-delivered",
          payload: { deliveryStatus: "delivered" },
        },
        {
          id: "event-changed",
          kind: "session.message",
          timestamp: "2026-06-22T11:56:30.000Z",
          title: "Follow-up arrived",
          summary: "User added a follow-up after completion.",
          sessionKey: changedSession,
        },
      ],
      { nowMs: now, reviewLastSeenAt: "2026-06-22T11:50:00.000Z" },
    );

    expect(model.reviewQueue.lastSeenAt).toBe("2026-06-22T11:50:00.000Z");
    expect(model.reviewQueue.summary).toMatchObject({
      recentlyCompleted: 3,
      recentlyFailed: 1,
      changedSinceLastSeen: 4,
      cancelled: 1,
      delivered: 1,
    });
    expect(model.reviewQueue.recentlyCompleted.map((item) => item.id)).toEqual([
      `session:${changedSession}`,
      `session:${cancelledSession}`,
      `session:${doneSession}`,
    ]);
    expect(model.reviewQueue.recentlyFailed[0]).toMatchObject({
      id: `session:${failedSession}`,
      kind: "failed",
      tone: "error",
      status: "failed",
    });
    expect(model.reviewQueue.recentlyCompleted.find((item) => item.id === `session:${cancelledSession}`)).toMatchObject({
      kind: "cancelled",
      categories: expect.arrayContaining(["cancelled", "changed"]),
      status: "cancelled",
    });
    expect(model.reviewQueue.recentlyCompleted.find((item) => item.id === `session:${doneSession}`)).toMatchObject({
      delivered: true,
      deliveryStatus: "delivered",
    });
    expect(model.reviewQueue.changedSinceLastSeen.map((item) => item.id)).toEqual(
      expect.arrayContaining([`session:${doneSession}`, `session:${failedSession}`, `session:${cancelledSession}`, `session:${changedSession}`]),
    );
  });

  it("separates needs-review and stale items in the review queue", () => {
    const reviewSession = "agent:dashclaw:discord:thread:needs-review-lane";
    const staleSession = "agent:dashclaw:discord:thread:stale-active-lane";

    const model = buildDashboardModel(
      snapshot({
        agents: [{ id: "dashclaw", name: "Dashclaw", model: "gpt-test" }],
        sessions: [
          {
            key: reviewSession,
            agentId: "dashclaw",
            label: "thread: inspect final answer",
            status: "needs_review",
            isActive: false,
            updatedAt: "2026-06-22T11:40:00.000Z",
          },
          {
            key: staleSession,
            agentId: "dashclaw",
            label: "thread: stale active lane",
            status: "running",
            isActive: true,
            updatedAt: "2026-06-22T11:40:00.000Z",
          },
        ],
      }),
      [],
      { nowMs: now, activeSessionStaleAfterMs: 5 * 60_000 },
    );

    expect(model.reviewQueue.needsReview[0]).toMatchObject({
      id: `session:${reviewSession}`,
      kind: "needs-review",
      categories: ["needs-review"],
    });
    expect(model.reviewQueue.stale[0]).toMatchObject({
      id: `session:${staleSession}`,
      kind: "stale",
      tone: "warn",
    });
    expect(model.reviewQueue.summary).toMatchObject({ needsReview: 1, stale: 1 });
  });
});
