import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIN_DASHBOARD_TOKEN_LENGTH,
  isLoopbackBind,
  resolveDashboardAuth,
  resolveWorkspacePath,
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

  it("resolves default and configured runtime paths from the workspace root", () => {
    const root = resolve("test-workspace");
    expect(resolveWorkspacePath(root, undefined, "apps/web/dist")).toBe(
      resolve(root, "apps/web/dist"),
    );
    expect(resolveWorkspacePath(root, "./runtime/dashclaw.db", "data/dashclaw.db")).toBe(
      resolve(root, "runtime/dashclaw.db"),
    );

    const absolute = resolve(root, "external/runtime.db");
    expect(resolveWorkspacePath(root, absolute, "data/dashclaw.db")).toBe(absolute);
  });
});
