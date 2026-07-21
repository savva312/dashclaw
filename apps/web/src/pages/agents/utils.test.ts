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
        spawnedCwd: "/workspace/dashclaw-worktrees/task-040",
        spawnedWorkspaceDir: "/workspace/dashclaw",
      },
      {
        key: "agent:coder:subagent:explicit-worktree",
        agentId: "coder",
        label: "Future explicit worktree session",
        isActive: false,
        updatedAt: "2026-07-13T10:00:00.000Z",
        worktree: {
          branch: "agent/task-040-session-worktree",
          path: "/workspace/explicit/task-040",
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
    expect(stats.primarySession?.spawnedCwd).toBe("/workspace/dashclaw-worktrees/task-040");
    expect(stats.primarySession?.worktree).toBeUndefined();
  });

  it("falls back to the newest active session when the active task has no matching session", () => {
    const runtime = snapshot();
    runtime.tasks[1]!.sessionKey = "agent:coder:subagent:also-missing";
    const stats = buildAgentStats(runtime, runtime.agents[0]!);
    expect(stats.primarySession?.key).toBe("agent:coder:subagent:newest");
  });

  it("humanizes Discord session labels for the active Now label", () => {
    const runtime = snapshot();
    runtime.tasks = [];
    runtime.sessions = [
      {
        key: "agent:coder:discord:channel:1505558029129744436",
        agentId: "coder",
        label: "discord:1502628716830916770#evolve-monorepo",
        isActive: true,
        updatedAt: "2026-07-13T12:00:00.000Z",
      },
    ];
    const stats = buildAgentStats(runtime, runtime.agents[0]!);
    expect(stats.currentLabel).toBe("#evolve-monorepo");
    expect(stats.currentDetail).toContain("discord:1502628716830916770");
  });
});

describe("session execution context search", () => {
  const directorySession = snapshot().sessions[1]!;
  const explicitWorktreeSession = snapshot().sessions[2]!;

  it("matches reported working directory and workspace fragments", () => {
    expect(sessionMatchesQuery(directorySession, "dashclaw-worktrees/task-040")).toBe(true);
    expect(sessionMatchesQuery(directorySession, "/workspace/dashclaw")).toBe(true);
  });

  it("searches worktree fields only when explicit metadata exists", () => {
    expect(sessionMatchesQuery(directorySession, "task-040-session-worktree")).toBe(false);
    expect(sessionMatchesQuery(explicitWorktreeSession, "task-040-session-worktree")).toBe(true);
    expect(sessionMatchesQuery(explicitWorktreeSession, "/workspace/explicit/task-040")).toBe(true);
  });

  it("does not treat an agent workspace as worktree metadata", () => {
    expect(sessionMatchesQuery(directorySession, "/workspace/base")).toBe(false);
  });
});
