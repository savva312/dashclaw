import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

export const FAKE_GATEWAY_SCENARIOS = ["idle", "busy", "failed", "approval-heavy", "approval-cockpit", "degraded", "discord-workflow"] as const;
export type FakeGatewayScenario = (typeof FAKE_GATEWAY_SCENARIOS)[number];

export interface FakeGatewayOptions {
  port?: number;
  token?: string;
  scenario?: FakeGatewayScenario;
  assistantSequenceSessionKey?: string;
}

export interface FakeGatewayHandle {
  url: string;
  port: number;
  scenario: FakeGatewayScenario;
  close: () => Promise<void>;
  emitEvent: (event: string, payload?: unknown) => void;
  emitAssistantSequence: (sessionKey?: string) => void;
}

type JsonObject = Record<string, unknown>;

interface FakeGatewayScenarioData {
  health: JsonObject;
  agents: JsonObject[];
  sessions: JsonObject[];
  tasks: JsonObject[];
  jobs: JsonObject[];
  nodes: JsonObject[];
  approvals: JsonObject[];
  logs: string[];
}

const BASE_TIME = Date.parse("2026-06-24T18:00:00.000Z");

/** Minimal in-process Gateway mock for tests and offline development */
export async function startFakeGateway(options: FakeGatewayOptions = {}): Promise<FakeGatewayHandle> {
  const token = options.token ?? "test-token";
  const scenario = options.scenario ?? "busy";
  const state = cloneScenarioData(buildScenarioData(scenario));
  const clients = new Set<WebSocket>();
  let seq = 0;
  let assistantSequenceScheduled = false;

  const server: Server = createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "fake-openclaw-gateway", scenario }));
  });

  const emitEvent = (event: string, payload?: unknown) => {
    seq += 1;
    const msg = JSON.stringify({ type: "event", event, payload, seq });
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
  };

  const emitAssistantSequence = (sessionKey = "agent:main:main") => {
    const common = { sessionKey, runId: "run-stream-fixture", messageId: "message-stream-fixture" };
    emitEvent("chat", { ...common, state: "delta", deltaText: "I’m checking " });
    emitEvent("session.tool", { ...common, toolName: "read", phase: "completed" });
    emitEvent("chat", { ...common, state: "delta", deltaText: "the runtime now." });
    emitEvent("chat", { ...common, state: "final", text: "I’m checking the runtime now." });
  };

  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: "event", event: "connect.challenge", payload: { nonce: "test-nonce", ts: Date.now() } }));

    ws.on("message", (data) => {
      let frame: { type?: string; id?: string; method?: string; params?: Record<string, unknown> };
      try {
        frame = JSON.parse(String(data));
      } catch {
        return;
      }

      if (frame.type !== "req" || !frame.id || !frame.method) return;

      if (frame.method === "connect") {
        const auth = frame.params?.auth as { token?: string } | undefined;
        if (auth?.token !== token) {
          ws.send(JSON.stringify({ type: "res", id: frame.id, ok: false, error: { code: "UNAUTHORIZED", message: "unauthorized" } }));
          return;
        }
        ws.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: {
              type: "hello-ok",
              protocol: 4,
              server: { version: "fake-2026.6.0", connId: "fake-conn", scenario },
              features: {
                methods: [
                  "health",
                  "status",
                  "agents.list",
                  "sessions.list",
                  "sessions.preview",
                  "tasks.list",
                  "tasks.get",
                  "cron.list",
                  "cron.runs",
                  "node.list",
                  "exec.approval.list",
                  "exec.approval.get",
                  "exec.approval.resolve",
                  "plugin.approval.resolve",
                  "logs.tail",
                ],
                events: ["agent", "health", "sessions.changed", "exec.approval.requested", "exec.approval.resolved"],
              },
              snapshot: { presence: [], health: state.health },
              auth: { role: "operator", scopes: ["operator.read", "operator.write", "operator.admin"] },
              policy: { maxPayload: 26214400, tickIntervalMs: 15000 },
            },
          }),
        );
        if (options.assistantSequenceSessionKey && !assistantSequenceScheduled) {
          assistantSequenceScheduled = true;
          setTimeout(() => emitAssistantSequence(options.assistantSequenceSessionKey), 250);
        }
        return;
      }

      if (frame.method === "exec.approval.resolve" || frame.method === "plugin.approval.resolve") {
        const approval = resolveApproval(state.approvals, frame.params);
        emitEvent("exec.approval.resolved", approval);
        ws.send(JSON.stringify({ type: "res", id: frame.id, ok: true, payload: { ok: true, approval } }));
        return;
      }

      const payload = responseFor(state, frame.method, frame.params);
      ws.send(JSON.stringify({ type: "res", id: frame.id, ok: true, payload }));
    });

    ws.on("close", () => clients.delete(ws));
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : (options.port ?? 0);

  return {
    url: `ws://127.0.0.1:${port}`,
    port,
    scenario,
    close: () =>
      new Promise((resolve) => {
        for (const ws of clients) ws.close();
        wss.close(() => server.close(() => resolve()));
      }),
    emitEvent,
    emitAssistantSequence,
  };
}

function responseFor(state: FakeGatewayScenarioData, method: string, params?: Record<string, unknown>): unknown {
  switch (method) {
    case "health":
      return state.health;
    case "status":
      return { runtime: state.health.ok === false ? "degraded" : "running" };
    case "agents.list":
      return { agents: state.agents };
    case "sessions.list":
      return { sessions: state.sessions };
    case "sessions.preview": {
      const keys = Array.isArray(params?.keys)
        ? params.keys.filter((key): key is string => typeof key === "string")
        : [];
      const limit = typeof params?.limit === "number" ? Math.max(1, params.limit) : 20;
      return {
        previews: keys.map((key) => {
          const session = state.sessions.find((candidate) => candidate.key === key);
          return {
            key,
            status: session?.status,
            items: session
              ? [
                  { role: "user", text: `Status check for ${session.label ?? session.key}` },
                  { role: "assistant", text: `Preview for ${session.label ?? session.key}` },
                ].slice(-limit)
              : [],
          };
        }),
      };
    }
    case "tasks.list":
      return { tasks: filterTasks(state.tasks, params) };
    case "tasks.get": {
      const id = typeof params?.id === "string" ? params.id : undefined;
      return { task: state.tasks.find((task) => task.id === id) ?? null };
    }
    case "cron.list":
      return { jobs: state.jobs };
    case "cron.runs":
      return { runs: [] };
    case "node.list":
      return { nodes: state.nodes };
    case "exec.approval.list":
      return { approvals: state.approvals };
    case "exec.approval.get": {
      const id = typeof params?.id === "string" ? params.id : undefined;
      return { approval: state.approvals.find((approval) => approval.id === id) ?? null };
    }
    case "logs.tail":
      return { lines: state.logs };
    default:
      return {};
  }
}

function filterTasks(tasks: JsonObject[], params?: Record<string, unknown>): JsonObject[] {
  const status = params?.status;
  if (!Array.isArray(status)) return tasks;
  const statuses = new Set(status.filter((value): value is string => typeof value === "string"));
  if (statuses.size === 0) return tasks;
  return tasks.filter((task) => typeof task.status === "string" && statuses.has(task.status));
}

function resolveApproval(approvals: JsonObject[], params?: Record<string, unknown>): JsonObject {
  const id = typeof params?.id === "string" ? params.id : undefined;
  const decision = params?.decision === "approved" ? "approved" : "denied";
  const approval = approvals.find((candidate) => candidate.id === id) ?? { id: id ?? "unknown", kind: "exec", command: "unknown" };
  approval.status = decision;
  approval.resolvedAt = new Date().toISOString();
  return approval;
}

function buildScenarioData(scenario: FakeGatewayScenario): FakeGatewayScenarioData {
  const common = commonScenarioData();

  switch (scenario) {
    case "idle":
      return {
        ...common,
        sessions: [session("agent:main:main", "main", "Main", "idle", -2 * 60_000)],
        tasks: [],
        logs: ["[info] fake gateway idle"],
      };
    case "failed":
      return {
        ...common,
        sessions: [
          session("agent:main:failed-review", "main", "Failed review", "failed", -8 * 60_000),
          session("agent:qa:timeout", "qa", "Timed-out QA check", "timeout", -20 * 60_000),
        ],
        tasks: [
          task("task-failed-build", "failed", "Build failed", "main", "agent:main:failed-review", "run-failed-build", -12 * 60_000, -8 * 60_000, "pnpm test exited 1"),
          task("task-timeout-qa", "timed_out", "QA smoke timed out", "qa", "agent:qa:timeout", "run-timeout-qa", -70 * 60_000, -20 * 60_000, "browser smoke exceeded 50m"),
        ],
        logs: ["[error] task-failed-build pnpm test exited 1", "[warn] task-timeout-qa timed out"],
      };
    case "approval-heavy":
      return {
        ...common,
        sessions: [
          session("agent:main:release", "main", "Release orchestration", "running", -30_000, "run-release", "git push"),
          session("agent:ops:approval", "ops", "Production approval", "running", -60_000, "run-prod", "terraform plan"),
        ],
        tasks: [
          task("task-release", "running", "Release orchestration", "main", "agent:main:release", "run-release", -35 * 60_000),
          task("task-prod-approval", "queued", "Waiting on production approval", "ops", "agent:ops:approval", "run-prod", -15 * 60_000),
        ],
        approvals: [
          approval("approval-restart", "exec", "gateway.restart.request --reason deploy", "main", "agent:main:release", -10 * 60_000),
          approval("approval-terraform", "exec", "terraform apply -auto-approve", "ops", "agent:ops:approval", -8 * 60_000),
          approval("approval-plugin", "plugin", "deploy-plugin publish canary", "ops", "agent:ops:approval", -5 * 60_000),
        ],
        logs: ["[warn] 3 approvals pending", "[info] release orchestration waiting for operator"],
      };
    case "approval-cockpit":
      return {
        ...common,
        health: {
          ok: true,
          uptimeMs: 12345,
          version: "fake-2026.6.0",
          raw: {
            tools: { exec: { mode: "full", askFallback: "ask" } },
            hostApproval: { source: "host-local", approvalRequired: true },
          },
        },
        sessions: [
          session("agent:main:approval-cockpit", "main", "Approval cockpit", "running", -90_000, "run-approval-cockpit", "exec"),
          session("agent:ops:expired-approval", "ops", "Expired approval", "running", -10 * 60_000, "run-expired-approval", "exec"),
          session("agent:qa:consumed-approval", "qa", "Consumed approval", "completed", -4 * 60_000, "run-consumed-approval"),
        ],
        tasks: [
          task("task-approval-cockpit", "queued", "Waiting on allow-once exec approval", "main", "agent:main:approval-cockpit", "run-approval-cockpit", -2 * 60_000),
          task("task-expired-approval", "timed_out", "Approval expired before command ran", "ops", "agent:ops:expired-approval", "run-expired-approval", -20 * 60_000, -10 * 60_000, "approval prompt expired"),
          task("task-consumed-approval", "completed", "Approval consumed by shell", "qa", "agent:qa:consumed-approval", "run-consumed-approval", -8 * 60_000, -4 * 60_000),
        ],
        approvals: [
          approval("approval-allow-once", "exec", "printf 'hello' && echo done | tee /tmp/approval-cockpit\nprintf 'second line'", "main", "agent:main:approval-cockpit", -90_000, {
            host: "local-dev",
            cwd: "/workspace/dashclaw",
            scope: "allow-once",
            timeoutMs: 300000,
            expiresAt: iso(210_000),
          }),
          approval("approval-expired", "exec", "terraform plan && terraform apply", "ops", "agent:ops:expired-approval", -20 * 60_000, {
            host: "ops-runner",
            cwd: "/infra/prod",
            scope: "allow-once",
            expiresAt: iso(-15 * 60_000),
          }),
          approval("approval-consumed", "exec", "pnpm test -- dashboard.test.ts", "qa", "agent:qa:consumed-approval", -8 * 60_000, {
            status: "approved",
            resolvedAt: iso(-5 * 60_000),
            consumedAt: iso(-4 * 60_000),
            decision: "approved",
            scope: "allow-once",
            host: "local-dev",
            cwd: "/workspace/dashclaw",
          }),
          approval("approval-denied", "exec", "sudo systemctl restart gateway", "ops", "agent:ops:expired-approval", -12 * 60_000, {
            status: "denied",
            resolvedAt: iso(-11 * 60_000),
            failureReason: "operator denied privileged restart",
            host: "ops-runner",
            cwd: "/workspace/dashclaw",
          }),
        ],
        logs: [
          "[warn] full mode does not disable host-local exec approvals",
          "[error] approval id approval-rotated-unknown not found; control UI may be stale",
          "[info] approval-consumed was approved and consumed by shell runner",
        ],
      };
    case "degraded":
      return {
        ...common,
        health: { ok: true, degraded: true, uptimeMs: 12345, version: "fake-2026.6.0", reason: "event stream lagging" },
        sessions: [
          session("agent:main:main", "main", "Main", "running", -12 * 60_000, "run-stale", "process"),
          session("agent:worker:subagent", "worker", "Subagent result delivery", "running", -18 * 60_000, "run-delivery", "sessions_yield"),
        ],
        tasks: [
          task("task-stale-main", "running", "Long running main task", "main", "agent:main:main", "run-stale", -65 * 60_000),
          task("task-delivery-lost", "failed", "Subagent delivery failed", "worker", "agent:worker:subagent", "run-delivery", -25 * 60_000, -18 * 60_000, "parent session unavailable", {
            parentSessionKey: "agent:main:main",
            deliveryState: "failed-delivery",
          }),
        ],
        nodes: [{ id: "node-phone", label: "Phone", connected: false, platform: "ios" }],
        logs: ["[warn] gateway degraded: event stream lagging", "[error] subagent delivery failed"],
      };
    case "discord-workflow":
      return discordWorkflowScenarioData(common);
    case "busy":
      return common;
  }
}

function discordWorkflowScenarioData(common: FakeGatewayScenarioData): FakeGatewayScenarioData {
  const mainChannel = "agent:dashclaw:discord:channel:1519213500986036264";
  const workBoardThread = "agent:dashclaw:discord:thread:work-board";
  const completedThread = "agent:dashclaw:discord:thread:completed-summary";
  const failedThread = "agent:dashclaw:discord:thread:failed-delivery";
  const archivedThread = "agent:dashclaw:discord:thread:archived-context";
  const subagentSession = "agent:dashclaw:discord:thread:work-board:subagent:model";
  const acpSession = "agent:coder:acp:TASK-039-coding-lane";
  const missingParentThread = "agent:dashclaw:discord:thread:missing-original";

  return {
    ...common,
    agents: [
      { id: "dashclaw", name: "Dashclaw", model: "openclaw/default", runtime: "openclaw", workspace: "/workspace" },
      { id: "fixture-model", name: "Fixture Model Lane", model: "openclaw/default", runtime: "openclaw", workspace: "/workspace" },
      { id: "coder", name: "ACP Coding Lane", model: "openclaw/default", runtime: "openclaw", workspace: "/workspace" },
      { id: "ops", name: "Ops Watch", model: "openclaw/default", runtime: "openclaw", workspace: "/workspace" },
    ],
    sessions: [
      session(mainChannel, "dashclaw", "#dashclaw / main discussion", "running", -30_000, "run-channel-main", "message", {
        channelId: "1519213500986036264",
        channelName: "dashclaw",
        platform: "discord",
        permalink: "discord://channels/example/1519213500986036264",
      }),
      session(workBoardThread, "dashclaw", "thread: implement work board", "running", -45_000, "run-thread-work-board", "spawn_subagent", {
        parentSessionKey: mainChannel,
        channelId: "1519213500986036264",
        threadId: "thread-work-board",
        platform: "discord",
        permalink: "discord://channels/example/1519213500986036264/thread-work-board",
      }),
      session(subagentSession, "fixture-model", "TASK-039 fixture/model lane", "running", -60_000, "run-subagent-fixture", "pnpm test", {
        parentSessionKey: workBoardThread,
        spawnedBy: workBoardThread,
        requesterSessionKey: workBoardThread,
        spawnedCwd: "/workspace/.worktrees/task-039-fixture-model-lane",
        worktree: {
          id: "task-039-fixture-model-lane",
          branch: "agent/task-039-fixture-model-lane",
          repoRoot: "/workspace/dashclaw",
        },
      }),
      session(acpSession, "coder", "ACP lane: fixture extension", "queued", -2 * 60_000, "run-acp-fixture", "waiting for approval", {
        parentSessionKey: workBoardThread,
        spawnedBy: workBoardThread,
      }),
      session(completedThread, "dashclaw", "thread: completed fixture summary", "completed", -20 * 60_000, undefined, undefined, {
        parentSessionKey: mainChannel,
        channelId: "1519213500986036264",
        threadId: "thread-completed-summary",
        platform: "discord",
        finalSummary: "Fixture summary posted back to the task thread.",
        permalink: "discord://channels/example/1519213500986036264/thread-completed-summary",
      }),
      session(failedThread, "dashclaw", "thread: investigate failed delivery", "failed", -12 * 60_000, undefined, undefined, {
        parentSessionKey: mainChannel,
        channelId: "1519213500986036264",
        threadId: "thread-failed-delivery",
        platform: "discord",
        permalink: "discord://channels/example/1519213500986036264/thread-failed-delivery",
      }),
      session(archivedThread, "dashclaw", "thread: archived context", "completed", -3 * 60 * 60_000, undefined, undefined, {
        parentSessionKey: mainChannel,
        channelId: "1519213500986036264",
        threadId: "thread-archived-context",
        platform: "discord",
        archived: true,
        permalink: "discord://channels/example/1519213500986036264/thread-archived-context",
      }),
    ],
    tasks: [
      task("task-discord-main-triage", "running", "Coordinate Discord workflow triage", "dashclaw", mainChannel, "run-channel-main", -10 * 60_000, undefined, undefined, {
        kind: "discord-channel",
      }),
      task("task-work-board", "running", "Implement work board fixture", "dashclaw", workBoardThread, "run-thread-work-board", -35 * 60_000, undefined, undefined, {
        kind: "discord-thread",
        parentSessionKey: mainChannel,
      }),
      task("task-fixture-model-lane", "running", "Inspect fake gateway runtime model", "fixture-model", subagentSession, "run-subagent-fixture", -8 * 60_000, undefined, undefined, {
        kind: "subagent",
        parentTaskId: "task-work-board",
        parentSessionKey: workBoardThread,
      }),
      task("task-acp-review", "queued", "Review fixture extension", "coder", acpSession, "run-acp-fixture", -2 * 60_000, undefined, undefined, {
        kind: "acp",
        parentTaskId: "task-work-board",
        parentSessionKey: workBoardThread,
        deliveryState: "queued",
      }),
      task("task-thread-summary", "completed", "Publish fixture summary to thread", "dashclaw", completedThread, "run-thread-summary", -28 * 60_000, -20 * 60_000, undefined, {
        kind: "discord-thread",
        deliveryState: "delivered",
        finalSummary: "Completed summary was delivered to Discord.",
      }),
      task("task-failed-delivery", "failed", "Investigate failed delivery", "dashclaw", failedThread, "run-failed-delivery", -25 * 60_000, -12 * 60_000, "Discord result delivery failed after thread handoff", {
        kind: "discord-thread",
        deliveryState: "failed-delivery",
      }),
      task("task-lost-background-result", "timed_out", "Recover orphaned subagent result", "fixture-model", "agent:fixture-model:subagent:missing-delivery", "run-lost-result", -90 * 60_000, -45 * 60_000, "parent thread unavailable before result delivery", {
        kind: "subagent",
        parentSessionKey: missingParentThread,
        deliveryState: "lost-parent",
      }),
    ],
    approvals: [
      approval("approval-discord-thread-test", "exec", "pnpm --filter @dashclaw/web test -- dashboard.test.ts", "coder", acpSession, -90_000),
    ],
    logs: [
      "[info] discord-workflow fixture: main channel plus task threads loaded",
      "[info] task-fixture-model-lane spawned from thread: implement work board",
      "[warn] task-lost-background-result has partial lineage: parent thread missing",
      "[error] task-failed-delivery Discord result delivery failed after thread handoff",
    ],
  };
}

function commonScenarioData(): FakeGatewayScenarioData {
  return {
    health: { ok: true, uptimeMs: 12345, version: "fake-2026.6.0" },
    agents: [
      {
        id: "main",
        name: "Main Agent",
        model: { primary: "openai/gpt-5.6-terra" },
        agentRuntime: { id: "openclaw", source: "gateway" },
        thinkingDefault: "medium",
        workspace: "/workspace",
      },
      { id: "worker", name: "Worker Subagent", model: "openclaw/default", runtime: "openclaw", workspace: "/workspace" },
      { id: "qa", name: "QA Agent", model: "openclaw/default", runtime: "openclaw", workspace: "/workspace" },
      { id: "ops", name: "Ops Agent", model: "openclaw/default", runtime: "openclaw", workspace: "/workspace" },
    ],
    sessions: [
      session("agent:main:main", "main", "Main", "running", -30_000, "run-main", "read", {
        sessionId: "session-main",
        kind: "main",
        startedAt: BASE_TIME - 10 * 60_000,
        runtimeMs: 570_000,
        agentRuntime: { id: "openclaw", source: "gateway" },
        model: { primary: "openai/gpt-5.6-terra" },
        modelProvider: "openai",
        hasActiveRun: true,
        hasActiveSubagentRun: true,
        inputTokens: 12_000,
        outputTokens: 3_000,
        totalTokens: 15_000,
        contextTokens: 128_000,
        estimatedCostUsd: 0.42,
        contextBudgetStatus: { status: "ok", remainingTokens: 113_000, usedPercent: 11.72 },
        deliveryContext: { channel: "dashboard", to: "operator" },
        origin: { provider: "openclaw", surface: "dashboard" },
        spawnedWorkspaceDir: "/workspace",
        spawnedCwd: "/workspace/dashclaw",
      }),
      session("agent:worker:subagent", "worker", "Worker subagent", "running", -45_000, "run-subagent", "pnpm test", { parentSessionKey: "agent:main:main" }),
      session("agent:qa:queued", "qa", "Queued QA", "queued", -90_000),
    ],
    tasks: [
      task("task-1", "running", "Review PR", "main", "agent:main:main", "run-main", -5 * 60_000, undefined, undefined, {
        taskId: "task-1",
        ownerKey: "agent:main:main",
        childSessionKey: "agent:worker:subagent",
        sourceId: "dashboard",
        flowId: "flow-review",
        createdAt: BASE_TIME - 6 * 60_000,
        updatedAt: BASE_TIME - 30_000,
        progressSummary: "Reviewing changed files",
        runtime: { id: "run-main", source: "gateway", startedAt: BASE_TIME - 5 * 60_000, runtimeMs: 270_000 },
      }),
      task("task-subagent-1", "running", "Run dashboard selectors", "worker", "agent:worker:subagent", "run-subagent", -4 * 60_000, undefined, undefined, {
        kind: "subagent",
        parentTaskId: "task-1",
        parentSessionKey: "agent:main:main",
      }),
      task("task-queued-qa", "queued", "Queue browser smoke", "qa", "agent:qa:queued", "run-qa", -2 * 60_000),
    ],
    jobs: [{ id: "cron-1", name: "Daily digest", enabled: true, schedule: "0 9 * * *" }],
    nodes: [{ id: "node-desktop", label: "Desktop", connected: true, platform: "linux" }],
    approvals: [],
    logs: ["[info] fake gateway running", "[info] subagent task linked to parent task-1"],
  };
}

function session(
  key: string,
  agentId: string,
  label: string,
  status: string,
  updatedOffsetMs: number,
  currentRunId?: string,
  currentTool?: string,
  extra: JsonObject = {},
): JsonObject {
  return {
    key,
    agentId,
    label,
    status,
    isActive: status === "running" || status === "queued",
    updatedAt: iso(updatedOffsetMs),
    lastInteractionAt: iso(updatedOffsetMs),
    currentRunId,
    currentTool,
    ...extra,
  };
}

function task(
  id: string,
  status: string,
  title: string,
  agentId: string,
  sessionKey: string,
  runId: string,
  startedOffsetMs: number,
  endedOffsetMs?: number,
  error?: string,
  extra: JsonObject = {},
): JsonObject {
  return {
    id,
    status,
    title,
    agentId,
    sessionKey,
    runId,
    startedAt: iso(startedOffsetMs),
    endedAt: endedOffsetMs === undefined ? undefined : iso(endedOffsetMs),
    error,
    ...extra,
  };
}

function approval(
  id: string,
  kind: "exec" | "plugin",
  command: string,
  agentId: string,
  sessionKey: string,
  requestedOffsetMs: number,
  extra: JsonObject = {},
): JsonObject {
  return {
    id,
    kind,
    status: "pending",
    command,
    agentId,
    sessionKey,
    requestedAt: iso(requestedOffsetMs),
    ...extra,
  };
}

function iso(offsetMs: number): string {
  return new Date(BASE_TIME + offsetMs).toISOString();
}

function cloneScenarioData(data: FakeGatewayScenarioData): FakeGatewayScenarioData {
  return JSON.parse(JSON.stringify(data)) as FakeGatewayScenarioData;
}
