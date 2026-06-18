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
