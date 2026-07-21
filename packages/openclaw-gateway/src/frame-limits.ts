import { Buffer } from "node:buffer";
import { RUNTIME_LIMITS } from "@dashclaw/runtime-model";
import type { GatewayFrame } from "./types.js";

export class GatewayFrameLimitError extends Error {
  constructor(reason: string) {
    super(`Gateway frame rejected: ${reason}`);
    this.name = "GatewayFrameLimitError";
  }
}

export function parseGatewayFrame(raw: string): GatewayFrame {
  if (Buffer.byteLength(raw, "utf8") > RUNTIME_LIMITS.gateway.maxFrameBytes) {
    throw new GatewayFrameLimitError("frame exceeds byte limit");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GatewayFrameLimitError("invalid JSON");
  }

  assertJsonComplexity(parsed);
  if (!isGatewayFrame(parsed)) {
    throw new GatewayFrameLimitError("invalid frame envelope");
  }
  return parsed;
}

export function serializeGatewayFrame(frame: GatewayFrame): string {
  assertJsonComplexity(frame);
  const serialized = JSON.stringify(frame);
  if (Buffer.byteLength(serialized, "utf8") > RUNTIME_LIMITS.gateway.maxFrameBytes) {
    throw new GatewayFrameLimitError("frame exceeds byte limit");
  }
  return serialized;
}

export function assertJsonComplexity(value: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  let nodes = 0;

  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > RUNTIME_LIMITS.gateway.maxJsonNodes) {
      throw new GatewayFrameLimitError("JSON cardinality exceeds limit");
    }
    if (current.depth > RUNTIME_LIMITS.gateway.maxJsonDepth) {
      throw new GatewayFrameLimitError("JSON depth exceeds limit");
    }
    if (current.value === null || typeof current.value !== "object") continue;

    if (Array.isArray(current.value)) {
      if (current.value.length > RUNTIME_LIMITS.gateway.maxArrayItems) {
        throw new GatewayFrameLimitError("array cardinality exceeds limit");
      }
      for (const child of current.value) {
        stack.push({ value: child, depth: current.depth + 1 });
      }
      continue;
    }

    const values = Object.values(current.value as Record<string, unknown>);
    if (values.length > RUNTIME_LIMITS.gateway.maxObjectKeys) {
      throw new GatewayFrameLimitError("object cardinality exceeds limit");
    }
    for (const child of values) {
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
}

function isGatewayFrame(value: unknown): value is GatewayFrame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Record<string, unknown>;
  if (frame.type === "event") return typeof frame.event === "string";
  if (frame.type === "req") return typeof frame.id === "string" && typeof frame.method === "string";
  if (frame.type === "res") return typeof frame.id === "string" && typeof frame.ok === "boolean";
  return false;
}
