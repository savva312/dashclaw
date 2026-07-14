import { describe, expect, it } from "vitest";
import { gatewayBridgeTestUtils } from "./gateway-bridge.js";

describe("live OpenClaw contract normalization", () => {
  it("reduces structured agent model and runtime values to stable summaries", () => {
    expect(
      gatewayBridgeTestUtils.normalizeAgent({
        id: "main",
        name: "Main Agent",
        model: { primary: "openai/gpt-5.6-terra", fallbacks: ["private-value-not-copied"] },
        agentRuntime: { id: "openclaw", source: "gateway", internal: "not-copied" },
        thinkingDefault: "medium",
        workspace: "/workspace",
      }),
    ).toEqual({
      id: "main",
      name: "Main Agent",
      model: "openai/gpt-5.6-terra",
      runtime: "openclaw",
      runtimeSource: "gateway",
      thinkingDefault: "medium",
      workspace: "/workspace",
    });

    expect(
      gatewayBridgeTestUtils.normalizeAgent({
        id: "legacy",
        model: "openclaw/default",
        runtime: "openclaw",
      }),
    ).toMatchObject({ model: "openclaw/default", runtime: "openclaw" });
  });

  it("preserves live-shaped session lifecycle, lineage, usage, delivery, and directory fields", () => {
    const session = gatewayBridgeTestUtils.normalizeSession({
      key: "agent:worker:subagent:contract",
      sessionId: "session-contract",
      kind: "subagent",
      agentId: "worker",
      parentSessionKey: "agent:main:main",
      spawnedBy: "agent:main:main",
      ownerSessionKey: "agent:main:main",
      spawnDepth: 1,
      subagentRole: "implementation",
      subagentControlScope: "workspace",
      forkedFromParent: true,
      model: { primary: "openai/gpt-5.6-terra" },
      modelProvider: "openai",
      agentRuntime: { id: "openclaw", source: "gateway", ignored: "not-copied" },
      startedAt: 1784041200000,
      endedAt: 1784041260000,
      runtimeMs: 60000,
      updatedAt: 1784041260000,
      lastInteractionAt: "2026-07-14T09:41:00.000Z",
      status: "completed",
      hasActiveRun: false,
      hasActiveSubagentRun: false,
      subagentRunState: "completed",
      abortedLastRun: false,
      inputTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500,
      contextTokens: 128000,
      estimatedCostUsd: 0.125,
      contextBudgetStatus: { status: "ok", remainingTokens: 126500, usedPercent: 1.17, raw: "not-copied" },
      compactionCheckpoint: {
        at: 1784041230000,
        reason: "threshold",
        tokensBefore: 90000,
        tokensAfter: 30000,
        raw: "not-copied",
      },
      deliveryContext: { channel: "discord", to: "thread-1", accountId: "account-1", threadId: "thread-1", text: "not-copied" },
      origin: { provider: "discord", surface: "channel", chatType: "thread", channelId: "channel-1", threadId: "thread-1", message: "not-copied" },
      spawnedWorkspaceDir: "/workspace",
      spawnedCwd: "/workspace/dashclaw-task-042",
    });

    expect(session).toMatchObject({
      sessionId: "session-contract",
      kind: "subagent",
      parentSessionKey: "agent:main:main",
      spawnDepth: 1,
      forkedFromParent: true,
      model: "openai/gpt-5.6-terra",
      modelProvider: "openai",
      agentRuntime: "openclaw",
      agentRuntimeSource: "gateway",
      startedAt: "2026-07-14T15:00:00.000Z",
      endedAt: "2026-07-14T15:01:00.000Z",
      runtimeMs: 60000,
      updatedAt: "2026-07-14T15:01:00.000Z",
      totalTokens: 1500,
      estimatedCostUsd: 0.125,
      contextBudgetStatus: { status: "ok", remainingTokens: 126500, usedPercent: 1.17 },
      compactionCheckpoint: {
        timestamp: "2026-07-14T15:00:30.000Z",
        reason: "threshold",
        tokensBefore: 90000,
        tokensAfter: 30000,
      },
      deliveryContext: { channel: "discord", to: "thread-1", accountId: "account-1", threadId: "thread-1" },
      origin: { provider: "discord", surface: "channel", chatType: "thread", channelId: "channel-1", threadId: "thread-1" },
      spawnedWorkspaceDir: "/workspace",
      spawnedCwd: "/workspace/dashclaw-task-042",
    });
    expect(session.worktree).toBeUndefined();
    expect(JSON.stringify(session)).not.toContain("not-copied");
  });

  it("preserves live-shaped task progress, results, runtime, and links", () => {
    const task = gatewayBridgeTestUtils.normalizeTask({
      id: "task-contract",
      status: "failed",
      kind: "subagent",
      title: "Contract task",
      agentId: "worker",
      sessionKey: "agent:worker:subagent:contract",
      runId: "run-contract",
      ownerKey: "agent:main:main",
      childSessionKey: "agent:worker:subagent:contract",
      sourceId: "source-contract",
      flowId: "flow-contract",
      createdAt: 1784041200000,
      updatedAt: 1784041260000,
      startedAt: 1784041210000,
      endedAt: 1784041250000,
      runtime: { id: "runtime-contract", source: "gateway", startedAt: 1784041210000, endedAt: 1784041250000, durationMs: 40000, raw: "not-copied" },
      progressSummary: "Ran contract checks",
      terminalSummary: "One contract check failed",
      error: { message: "Contract mismatch", code: "CONTRACT_MISMATCH", kind: "validation", stack: "not-copied" },
    });

    expect(task).toMatchObject({
      ownerKey: "agent:main:main",
      childSessionKey: "agent:worker:subagent:contract",
      sourceId: "source-contract",
      flowId: "flow-contract",
      createdAt: "2026-07-14T15:00:00.000Z",
      updatedAt: "2026-07-14T15:01:00.000Z",
      startedAt: "2026-07-14T15:00:10.000Z",
      endedAt: "2026-07-14T15:00:50.000Z",
      runtime: {
        id: "runtime-contract",
        source: "gateway",
        startedAt: "2026-07-14T15:00:10.000Z",
        endedAt: "2026-07-14T15:00:50.000Z",
        runtimeMs: 40000,
      },
      progressSummary: "Ran contract checks",
      terminalSummary: "One contract check failed",
      error: "Contract mismatch",
      errorCode: "CONTRACT_MISMATCH",
      errorKind: "validation",
    });
    expect(JSON.stringify(task)).not.toContain("not-copied");
  });

  it("keeps legacy strings and omits missing or invalid values", () => {
    const session = gatewayBridgeTestUtils.normalizeSession({
      key: "agent:legacy:main",
      model: "openclaw/default",
      agentRuntime: "openclaw",
      updatedAt: "not-a-timestamp",
      startedAt: 42,
      contextBudgetStatus: "warning",
    });
    const task = gatewayBridgeTestUtils.normalizeTask({
      id: "legacy-task",
      status: "completed",
      startedAt: "2026-07-14T09:40:10Z",
      endedAt: "invalid",
      runtime: "legacy-runtime",
      error: "legacy error",
    });

    expect(session).toMatchObject({ model: "openclaw/default", agentRuntime: "openclaw", contextBudgetStatus: { status: "warning" } });
    expect(session.updatedAt).toBeUndefined();
    expect(session.startedAt).toBeUndefined();
    expect(task.startedAt).toBe("2026-07-14T09:40:10.000Z");
    expect(task.endedAt).toBeUndefined();
    expect(task.runtime).toEqual({ id: "legacy-runtime" });
    expect(task.error).toBe("legacy error");
  });
});

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

describe("assistant stream accumulation", () => {
  it("coalesces delta and cumulative chunks under one stable timeline id", () => {
    const streams = gatewayBridgeTestUtils.createAssistantStreamAccumulator();
    const base = { sessionKey: "session-a", runId: "run-a", messageId: "message-a" };
    const first = streams.consume("chat", { ...base, state: "delta", deltaText: "H" });
    const second = streams.consume("chat", { ...base, state: "delta", text: "He" });
    const third = streams.consume("chat", { ...base, state: "delta", deltaText: "llo" });
    const final = streams.consume("chat", { ...base, state: "final", text: "Hello" });

    expect([first?.timelineId, second?.timelineId, third?.timelineId, final?.timelineId]).toEqual([
      first?.timelineId,
      first?.timelineId,
      first?.timelineId,
      first?.timelineId,
    ]);
    expect(final).toMatchObject({ text: "Hello", terminal: true, sessionKey: "session-a" });
  });

  it("keeps concurrent sessions and response ids isolated and resets after final", () => {
    const streams = gatewayBridgeTestUtils.createAssistantStreamAccumulator();
    const a = streams.consume("agent", {
      stream: "assistant",
      sessionKey: "session-a",
      responseId: "response-a",
      data: { delta: "Alpha" },
    });
    const b = streams.consume("agent", {
      stream: "assistant",
      sessionKey: "session-b",
      responseId: "response-b",
      data: { text: "Beta" },
    });
    const finalA = streams.consume("agent", {
      stream: "assistant",
      sessionKey: "session-a",
      responseId: "response-a",
      phase: "done",
      data: { text: "Alpha done" },
    });
    const restartedA = streams.consume("agent", {
      stream: "assistant",
      sessionKey: "session-a",
      responseId: "response-a",
      data: { delta: "New" },
    });

    expect(a?.text).toBe("Alpha");
    expect(b?.text).toBe("Beta");
    expect(a?.timelineId).not.toBe(b?.timelineId);
    expect(finalA?.text).toBe("Alpha done");
    expect(restartedA?.timelineId).not.toBe(finalA?.timelineId);
    expect(restartedA?.text).toBe("New");
  });

  it("keeps one response across an interleaved completed tool event", () => {
    const streams = gatewayBridgeTestUtils.createAssistantStreamAccumulator();
    const base = { sessionKey: "session-a", runId: "run-a", messageId: "message-a" };
    const first = streams.consume("chat", { ...base, state: "delta", deltaText: "I’m checking " });

    expect(
      streams.consume("session.tool", {
        ...base,
        toolName: "read",
        phase: "completed",
      }),
    ).toBeNull();

    const second = streams.consume("chat", { ...base, state: "delta", deltaText: "the runtime now." });
    const final = streams.consume("chat", {
      ...base,
      state: "final",
      text: "I’m checking the runtime now.",
    });

    expect(second?.timelineId).toBe(first?.timelineId);
    expect(final?.timelineId).toBe(first?.timelineId);
    expect(final?.text).toBe("I’m checking the runtime now.");
  });

  it("does not mistake a delta suffix for a cumulative response", () => {
    const streams = gatewayBridgeTestUtils.createAssistantStreamAccumulator();
    const base = { sessionKey: "session-a", runId: "run-a", messageId: "message-a" };

    streams.consume("chat", { ...base, state: "delta", deltaText: "a" });
    const update = streams.consume("chat", { ...base, state: "delta", deltaText: "data" });

    expect(update?.text).toBe("adata");
  });

  it("finalizes an outstanding response at a terminal session boundary", () => {
    const streams = gatewayBridgeTestUtils.createAssistantStreamAccumulator();
    const base = { sessionKey: "session-a", runId: "run-a", messageId: "message-a" };
    const streaming = streams.consume("chat", { ...base, state: "delta", deltaText: "Complete answer" });
    const completed = streams.finalizeBoundary("session.message", {
      sessionKey: "session-a",
      status: "done",
    });

    expect(completed).toEqual([
      expect.objectContaining({
        timelineId: streaming?.timelineId,
        text: "Complete answer",
        terminal: true,
      }),
    ]);
    expect(streams.finalizeBoundary("session.message", { sessionKey: "session-a", status: "done" })).toEqual([]);
  });
});
