import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot } from "@dashclaw/runtime-model";
import { buildAgentStats, sessionMatchesQuery } from "./utils";

function snapshot(): RuntimeSnapshot {
  return {
    gatewayId: "test",
    connectionState: "connected",
    health: { ok: true },
    agents: [{ id: "coder", workspace: "/workspace/base" }],
    sessions: [
      {
        key: "agent:coder:subagent:newest",
        agentId: "coder",
        label: "Newest active session",
        isActive: true,
        updatedAt: "2026-07-13T12:00:00.000Z",
      },
      {
        key: "agent:coder:subagent:task-040",
        agentId: "coder",
        label: "Task session",
        isActive: true,
        updatedAt: "2026-07-13T11:00:00.000Z",
        worktree: {
          branch: "agent/task-040-session-worktree",
          path: "/workspace/.worktrees/task-040",
        },
      },
    ],
    tasks: [
      {
        id: "unmatched-running-task",
        status: "running",
        agentId: "coder",
        sessionKey: "agent:coder:subagent:missing",
      },
      {
        id: "task-040",
        status: "running",
        agentId: "coder",
        sessionKey: "agent:coder:subagent:task-040",
      },
    ],
    cronJobs: [],
    approvals: [],
    nodes: [],
    activeRunCount: 2,
    pendingApprovalCount: 0,
    failedTaskCount: 0,
    updatedAt: "2026-07-13T12:00:00.000Z",
  };
}

describe("agent session selection", () => {
  it("prefers the active task session over the newest active session", () => {
    const runtime = snapshot();
    const stats = buildAgentStats(runtime, runtime.agents[0]!);
    expect(stats.activeSessions[0]?.key).toBe("agent:coder:subagent:newest");
    expect(stats.primarySession?.key).toBe("agent:coder:subagent:task-040");
    expect(stats.primarySession?.worktree?.branch).toBe("agent/task-040-session-worktree");
  });

  it("falls back to the newest active session when the active task has no matching session", () => {
    const runtime = snapshot();
    runtime.tasks[1]!.sessionKey = "agent:coder:subagent:also-missing";
    const stats = buildAgentStats(runtime, runtime.agents[0]!);
    expect(stats.primarySession?.key).toBe("agent:coder:subagent:newest");
  });
});

describe("session worktree search", () => {
  const session = snapshot().sessions[1]!;

  it("matches exact worktree branch and path fragments", () => {
    expect(sessionMatchesQuery(session, "task-040-session-worktree")).toBe(true);
    expect(sessionMatchesQuery(session, ".worktrees/task-040")).toBe(true);
  });

  it("does not treat an agent workspace as worktree metadata", () => {
    expect(sessionMatchesQuery(session, "/workspace/base")).toBe(false);
  });
});
