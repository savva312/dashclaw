import { describe, expect, it } from "vitest";
import { RUNTIME_LIMITS, type RuntimeSnapshot } from "@dashclaw/runtime-model";
import {
  PayloadValidationError,
  parseBoundedJsonText,
  parseCronRuns,
  parseSessionPreview,
  parseSnapshot,
  parseSseTimeline,
  parseTimelineResponse,
  safeRawPreview,
} from "./validation";

function validSnapshot(): RuntimeSnapshot {
  return {
    gatewayId: "test",
    connectionState: "connected",
    health: null,
    agents: [],
    sessions: [],
    tasks: [],
    cronJobs: [],
    approvals: [],
    nodes: [],
    activeRunCount: 0,
    pendingApprovalCount: 0,
    failedTaskCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

describe("browser payload validation", () => {
  it("accepts a valid bounded snapshot and rejects excessive collections", () => {
    const snapshot = validSnapshot();
    expect(parseSnapshot(snapshot)).toEqual(snapshot);
    expect(() =>
      parseSnapshot({
        ...validSnapshot(),
        sessions: Array.from(
          { length: RUNTIME_LIMITS.browser.maxSnapshotItemsPerCollection + 1 },
          (_, index) => ({ key: `session-${index}` }),
        ),
      }),
    ).toThrow(PayloadValidationError);
  });

  it("rejects malformed timeline entries and excessive SSE payloads", () => {
    expect(() => parseTimelineResponse({ events: [{ id: 1 }] })).toThrow(PayloadValidationError);
    expect(() =>
      parseSseTimeline("x".repeat(RUNTIME_LIMITS.browser.maxSseEventBytes + 1)),
    ).toThrow(PayloadValidationError);
  });

  it("rejects deep JSON and API responses above the byte budget", () => {
    let deep: Record<string, unknown> = {};
    for (let i = 0; i < RUNTIME_LIMITS.gateway.maxJsonDepth + 1; i += 1) {
      deep = { child: deep };
    }
    expect(() => parseBoundedJsonText(JSON.stringify(deep))).toThrow(PayloadValidationError);
    expect(() =>
      parseBoundedJsonText(
        JSON.stringify("x".repeat(RUNTIME_LIMITS.browser.maxApiResponseBytes)),
      ),
    ).toThrow(PayloadValidationError);
  });

  it("bounds session previews, cron collections, and raw previews", () => {
    expect(() =>
      parseSessionPreview({
        previews: [{
          items: Array.from(
            { length: RUNTIME_LIMITS.browser.maxSessionPreviewItems + 1 },
            () => ({ role: "assistant", text: "x" }),
          ),
        }],
      }),
    ).toThrow(PayloadValidationError);

    const runs = parseCronRuns({
      runs: Array.from({ length: RUNTIME_LIMITS.browser.maxCronRuns + 10 }, (_, id) => ({ id })),
    }) as { runs: unknown[] };
    expect(runs.runs).toHaveLength(RUNTIME_LIMITS.browser.maxCronRuns);

    const preview = safeRawPreview({ value: "x".repeat(RUNTIME_LIMITS.browser.maxRawPreviewChars * 2) });
    expect(preview.length).toBeLessThan(RUNTIME_LIMITS.browser.maxRawPreviewChars + 100);
    expect(preview).toContain("preview truncated");
  });
});
