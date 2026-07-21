import { describe, expect, it } from "vitest";
import {
  MIN_DASHBOARD_TOKEN_LENGTH,
  isLoopbackBind,
  resolveDashboardAuth,
} from "./startup-config.js";

describe("dashboard startup authentication", () => {
  it.each(["", " ", "short", "x".repeat(MIN_DASHBOARD_TOKEN_LENGTH - 1)])(
    "rejects an empty or weak configured dashboard token",
    (token) => {
      expect(() => resolveDashboardAuth(token, "127.0.0.1")).toThrow(
        `DASHCLAW_TOKEN must contain at least ${MIN_DASHBOARD_TOKEN_LENGTH}`,
      );
    },
  );

  it("preserves a sufficiently long configured token", () => {
    const token = "x".repeat(MIN_DASHBOARD_TOKEN_LENGTH);
    expect(resolveDashboardAuth(token, "0.0.0.0")).toEqual({
      token,
      source: "environment",
    });
  });

  it("generates a strong token only for loopback binds", () => {
    const first = resolveDashboardAuth(undefined, "127.0.0.1");
    const second = resolveDashboardAuth(undefined, "::1");

    expect(first.source).toBe("generated");
    expect(first.token.length).toBeGreaterThanOrEqual(MIN_DASHBOARD_TOKEN_LENGTH);
    expect(second.source).toBe("generated");
    expect(second.token).not.toBe(first.token);
    expect(() => resolveDashboardAuth(undefined, "0.0.0.0")).toThrow(
      "DASHCLAW_TOKEN must be configured",
    );
  });

  it.each(["localhost", "127.0.0.1", "127.42.0.1", "::1", "[::1]"])(
    "recognizes loopback bind %s",
    (bind) => expect(isLoopbackBind(bind)).toBe(true),
  );

  it.each(["0.0.0.0", "::", "192.168.1.10", "dashclaw.local"])(
    "rejects non-loopback bind %s",
    (bind) => expect(isLoopbackBind(bind)).toBe(false),
  );
});
