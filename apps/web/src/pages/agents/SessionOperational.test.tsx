import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { SessionSummary } from "@dashclaw/runtime-model";
import {
  SessionOperationalDetails,
  sessionOperationalBadges,
} from "./SessionOperational";

describe("sessionOperationalBadges", () => {
  it("shows only operator-relevant exceptions", () => {
    const complete: SessionSummary = {
      key: "agent:worker:subagent:complete",
      kind: "subagent",
      parentSessionKey: "agent:main:main",
      hasActiveRun: false,
      hasActiveSubagentRun: false,
      abortedLastRun: false,
      status: "completed",
    };
    expect(sessionOperationalBadges(complete)).toEqual([]);
  });

  it("flags aborted, active-subagent, inconsistent, and partial-lineage states", () => {
    expect(sessionOperationalBadges({ key: "agent:main:aborted", abortedLastRun: true })).toContainEqual({
      label: "last run aborted",
      tone: "error",
    });
    expect(sessionOperationalBadges({
      key: "agent:worker:subagent:active",
      kind: "subagent",
      hasActiveSubagentRun: true,
    })).toEqual([
      { label: "subagent active", tone: "ok" },
      { label: "parent not reported", tone: "warn" },
    ]);
    expect(sessionOperationalBadges({
      key: "agent:main:inconsistent",
      status: "completed",
      hasActiveRun: true,
    })).toContainEqual({ label: "active run with terminal status", tone: "warn" });
  });
});

describe("SessionOperationalDetails", () => {
  it("renders complete lifecycle, runtime, lineage, delivery, and origin evidence", () => {
    const parent: SessionSummary = { key: "agent:main:main", agentId: "main" };
    const session: SessionSummary = {
      key: "agent:worker:subagent:complete",
      sessionId: "session-complete",
      kind: "subagent",
      agentId: "worker",
      parentSessionKey: parent.key,
      spawnedBy: parent.key,
      ownerSessionKey: parent.key,
      spawnDepth: 1,
      subagentRole: "implementation",
      subagentControlScope: "workspace",
      forkedFromParent: true,
      model: "openai/gpt-5.6-terra",
      modelProvider: "openai",
      agentRuntime: "openclaw",
      agentRuntimeSource: "gateway",
      startedAt: "2026-07-14T10:00:00.000Z",
      endedAt: "2026-07-14T10:02:05.000Z",
      runtimeMs: 125_000,
      status: "completed",
      hasActiveRun: false,
      hasActiveSubagentRun: false,
      abortedLastRun: false,
      deliveryContext: { channel: "discord", to: "thread-1", accountId: "account-1", threadId: "thread-1" },
      origin: { provider: "discord", surface: "thread", chatType: "channel", channelId: "channel-1", threadId: "thread-1" },
    };
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <SessionOperationalDetails session={session} sessions={[parent, session]} />
      </MemoryRouter>,
    );

    expect(markup).toContain("2m 5s");
    expect(markup).toContain("openai/gpt-5.6-terra");
    expect(markup).toContain("Runtime source");
    expect(markup).toContain("gateway");
    expect(markup).toContain("implementation");
    expect(markup).toContain("thread-1");
    expect(markup).toContain(encodeURIComponent(parent.key));
  });

  it("shows missing partial evidence as not reported without inventing lineage", () => {
    const session: SessionSummary = { key: "agent:worker:subagent:partial", kind: "subagent" };
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <SessionOperationalDetails session={session} sessions={[session]} />
      </MemoryRouter>,
    );

    expect(markup).toContain("Parent session");
    expect(markup).toContain("not reported");
    expect(markup).not.toContain("agent:main:main");
  });
});
