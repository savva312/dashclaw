import { describe, expect, it } from "vitest";
import {
  isHighRiskRpc,
  isWriteRpc,
  redactValue,
  summarizeParams,
} from "./index.js";

describe("runtime-model", () => {
  it("classifies write and high-risk RPCs", () => {
    expect(isWriteRpc("sessions.abort")).toBe(true);
    expect(isWriteRpc("health")).toBe(false);
    expect(isHighRiskRpc("config.set")).toBe(true);
    expect(isHighRiskRpc("sessions.abort")).toBe(false);
  });

  it("redacts secrets from strings and objects", () => {
    expect(redactValue("Bearer abc123")).toBe("Bearer [REDACTED]");
    expect(redactValue({ token: "secret", name: "main" })).toEqual({
      token: "[REDACTED]",
      name: "main",
    });
  });

  it("summarizes params safely", () => {
    const summary = summarizeParams({ password: "x", id: "1" });
    expect(summary).toContain("[REDACTED]");
    expect(summary).toContain('"id":"1"');
  });
});
