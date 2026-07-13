import { describe, expect, it } from "vitest";
import { gatewayBridgeTestUtils } from "./gateway-bridge.js";

describe("gateway session normalization", () => {
  it("marks sessions active from hasActiveRun and running status", () => {
    const active = gatewayBridgeTestUtils.normalizeSession({
      key: "agent:evolve-monorepo:discord:channel:123",
      displayName: "discord channel",
      hasActiveRun: true,
      status: "running",
      model: "gpt-5.5",
    });
    expect(active.isActive).toBe(true);
    expect(active.agentId).toBe("evolve-monorepo");

    const idle = gatewayBridgeTestUtils.normalizeSession({
      key: "agent:evolve-monorepo:discord:channel:123",
      status: "done",
      hasActiveRun: false,
    });
    expect(idle.isActive).toBe(false);
  });

  it("preserves only explicit Gateway worktree metadata", () => {
    const worktreeSession = gatewayBridgeTestUtils.normalizeSession({
      key: "agent:coder:subagent:task-040",
      spawnedCwd: "/workspace/.worktrees/task-040",
      worktree: {
        id: "task-040",
        branch: "agent/task-040",
        repoRoot: "/workspace/dashclaw",
      },
    });
    expect(worktreeSession.worktree).toEqual({
      id: "task-040",
      path: "/workspace/.worktrees/task-040",
      branch: "agent/task-040",
      repoRoot: "/workspace/dashclaw",
    });

    const futurePath = gatewayBridgeTestUtils.normalizeSession({
      key: "agent:coder:subagent:future",
      spawnedCwd: "/wrong/fallback",
      worktree: { path: "/gateway/reported/worktree" },
    });
    expect(futurePath.worktree?.path).toBe("/gateway/reported/worktree");

    const missingPath = gatewayBridgeTestUtils.normalizeSession({
      key: "agent:coder:subagent:missing-path",
      worktree: { branch: "agent/missing-path" },
    });
    expect(missingPath.worktree).toEqual({
      id: undefined,
      path: undefined,
      branch: "agent/missing-path",
      repoRoot: undefined,
    });

    const ordinarySession = gatewayBridgeTestUtils.normalizeSession({
      key: "agent:coder:main",
      spawnedCwd: "/workspace/dashclaw",
    });
    expect(ordinarySession.worktree).toBeUndefined();
  });

  it("tracks live session activity from session.message events", () => {
    const tracker = gatewayBridgeTestUtils.createLiveSessionTracker();
    const key = "agent:evolve-monorepo:discord:channel:1505558029129744436";

    expect(
      tracker.update("session.message", {
        sessionKey: key,
        agentId: "evolve-monorepo",
        status: "running",
        message: {
          content: [{ type: "toolCall", name: "exec" }],
        },
      }),
    ).toBe(true);

    const sessions = tracker.apply([
      {
        key,
        agentId: "evolve-monorepo",
        label: "discord channel",
        isActive: false,
      },
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.isActive).toBe(true);
    expect(sessions[0]?.currentTool).toBe("exec");

    expect(
      tracker.update("session.message", {
        sessionKey: key,
        agentId: "evolve-monorepo",
        status: "done",
      }),
    ).toBe(true);

    const idleSessions = tracker.apply([
      {
        key,
        agentId: "evolve-monorepo",
        label: "discord channel",
        isActive: false,
      },
    ]);
    expect(idleSessions[0]?.isActive).toBe(false);
  });
});
