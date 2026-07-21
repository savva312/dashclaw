import { describe, expect, it } from "vitest";
import {
  HIGH_RISK_RPC_METHODS,
  WRITE_RPC_METHODS,
  canonicalizeRpcParams,
  isHighRiskRpc,
  isWriteRpc,
  REDACTED,
  redactValue,
  safeOutputString,
  safeOutputValue,
  safeSessionPreview,
  summarizeParams,
} from "./index.js";

const SENTINEL = "SEC005_SAFE_SENTINEL";

describe("runtime-model", () => {
  it("classifies write and high-risk RPCs", () => {
    expect(isWriteRpc("sessions.abort")).toBe(true);
    expect(isWriteRpc("health")).toBe(false);
    expect(isHighRiskRpc("config.set")).toBe(true);
    expect(isHighRiskRpc("sessions.abort")).toBe(true);
    expect(isHighRiskRpc("sessions.steer")).toBe(true);
    expect(isHighRiskRpc("tasks.cancel")).toBe(true);
    expect(isHighRiskRpc("cron.run")).toBe(true);
    expect(isHighRiskRpc("exec.approval.resolve")).toBe(true);
    expect(isWriteRpc("sessions.delete")).toBe(false);
    expect(isHighRiskRpc("sessions.delete")).toBe(false);
    expect([...HIGH_RISK_RPC_METHODS].every((method) => WRITE_RPC_METHODS.has(method))).toBe(true);
  });

  it("canonicalizes equivalent object ordering without collapsing parameter values", () => {
    expect(canonicalizeRpcParams({ b: 2, a: { y: true, x: "1" } })).toBe(
      canonicalizeRpcParams({ a: { x: "1", y: true }, b: 2 }),
    );
    expect(canonicalizeRpcParams({ value: "1" })).not.toBe(canonicalizeRpcParams({ value: 1 }));
    expect(canonicalizeRpcParams({ values: [1, 2] })).not.toBe(
      canonicalizeRpcParams({ values: [2, 1] }),
    );
  });

  it("rejects excessive, circular, and accessor RPC parameters", () => {
    let deep: Record<string, unknown> = {};
    for (let index = 0; index < 30; index += 1) deep = { child: deep };
    expect(() => canonicalizeRpcParams(deep)).toThrow("complexity limits");

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canonicalizeRpcParams(circular)).toThrow("circular references");

    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => "not evaluated",
    });
    expect(() => canonicalizeRpcParams(accessor)).toThrow("accessors");
  });

  it("redacts secrets from strings and objects", () => {
    expect(redactValue("Bearer abc123")).toBe("Bearer [REDACTED]");
    const value = redactValue({ token: "secret", name: "main" }) as Record<string, unknown>;
    expect(value.token).toBe(REDACTED);
    expect(value.name).toBe("main");
  });

  it("summarizes params safely", () => {
    const summary = summarizeParams({ password: "x", id: "1" });
    expect(summary).toContain("[REDACTED]");
    expect(summary).toContain('"id":"1"');
  });

  it("normalizes sensitive key case and separator variants", () => {
    const unsafe = JSON.parse(`{
      "Authorization": "${SENTINEL}",
      "proxy_authorization": "${SENTINEL}",
      "Set-Cookie": "${SENTINEL}",
      "cookies": "${SENTINEL}",
      "CREDENTIALS": "${SENTINEL}",
      "private.key": "${SENTINEL}",
      "private_key_pem": "${SENTINEL}",
      "AWS_ACCESS_KEY_ID": "${SENTINEL}",
      "aws-secret-access-key": "${SENTINEL}",
      "Api Key": "${SENTINEL}",
      "PassWord": "${SENTINEL}",
      "session_token": "${SENTINEL}",
      "gatewayToken": "${SENTINEL}",
      "webhookSecret": "${SENTINEL}",
      "safe": "diagnostic context",
      "__proto__": { "polluted": true },
      "constructor": { "prototype": { "polluted": true } }
    }`) as Record<string, unknown>;

    const safe = safeOutputValue(unsafe) as Record<string, unknown>;
    expect(JSON.stringify(safe)).not.toContain(SENTINEL);
    expect(safe.Authorization).toBe(REDACTED);
    expect(safe["aws-secret-access-key"]).toBe(REDACTED);
    expect(safe.safe).toBe("diagnostic context");
    expect(Object.getPrototypeOf(safe)).toBeNull();
    expect(Object.hasOwn(safe, "__proto__")).toBe(false);
    expect(Object.hasOwn(safe, "constructor")).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("redacts secrets embedded in commands, errors, headers, and private keys", () => {
    const unsafe = [
      `curl -H "Authorization: Bearer ${SENTINEL}" https://gateway.invalid`,
      `api_key=${SENTINEL}`,
      `password='${SENTINEL}'`,
      `AWS_SECRET_ACCESS_KEY=${SENTINEL}`,
      `webhook_secret=${SENTINEL}`,
      `Cookie: session=${SENTINEL}; theme=dark`,
      `{"api_key":"${SENTINEL}"}`,
      `-----BEGIN PRIVATE KEY-----\n${SENTINEL}\n-----END PRIVATE KEY-----`,
    ].join("\n");

    const safe = safeOutputString(unsafe);
    expect(safe).not.toContain(SENTINEL);
    expect(safe).toContain("curl");
    expect(safe).toContain("https://gateway.invalid");
    expect(safe).toContain(REDACTED);
    expect(safe).not.toContain("theme=dark");
    expect(safeOutputString("agent/task-039-fixture-model-lane")).toBe(
      "agent/task-039-fixture-model-lane",
    );
  });

  it("bounds hostile recursion, getters, arrays, keys, and strings", () => {
    let getterCalled = false;
    const circular: Record<string, unknown> = { useful: "kept" };
    circular.self = circular;
    Object.defineProperty(circular, "hostile", {
      enumerable: true,
      get() {
        getterCalled = true;
        return SENTINEL;
      },
    });
    circular.items = Array.from({ length: 10 }, (_, index) => index);
    circular.deep = { one: { two: { three: SENTINEL } } };

    const safe = safeOutputValue(circular, {
      maxDepth: 3,
      maxArrayItems: 2,
      maxObjectKeys: 10,
      maxStringLength: 8,
      maxTotalNodes: 20,
    }) as Record<string, unknown>;

    expect(getterCalled).toBe(false);
    expect(safe.hostile).toBe("[ACCESSOR OMITTED]");
    expect(safe.self).toBe("[CIRCULAR]");
    expect(safe.items).toEqual([0, 1, "[TRUNCATED]"]);
    expect(JSON.stringify(safe)).not.toContain(SENTINEL);

    const revoked = Proxy.revocable({ secret: SENTINEL }, {});
    revoked.revoke();
    expect(() => safeOutputValue(revoked.proxy)).not.toThrow();
    expect(safeOutputValue(revoked.proxy)).toBe("[UNREADABLE OBJECT]");
  });

  it("allowlists and redacts session preview fields", () => {
    const preview = safeSessionPreview({
      previews: [{
        key: "session-1",
        status: "ready",
        token: SENTINEL,
        items: [{
          id: "message-1",
          role: "assistant",
          text: `Authorization: Bearer ${SENTINEL}`,
          raw: SENTINEL,
        }],
      }],
      credentials: SENTINEL,
    });

    const serialized = JSON.stringify(preview);
    expect(serialized).not.toContain(SENTINEL);
    expect(serialized).not.toContain('"raw"');
    expect(serialized).not.toContain('"credentials"');
    expect(preview.previews[0]?.items[0]?.text).toContain(REDACTED);
  });
});
