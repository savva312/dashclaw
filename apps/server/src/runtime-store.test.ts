import { describe, expect, it } from "vitest";
import { RuntimeStore } from "./runtime-store.js";

describe("RuntimeStore timeline upsert", () => {
  it("persists one coherent row for a growing assistant response", () => {
    const store = new RuntimeStore(":memory:");
    const timestamp = "2026-07-13T10:00:00.000Z";
    store.upsertTimeline({
      id: "assistant-response-1",
      kind: "agent.assistant",
      timestamp,
      title: "Assistant responding",
      summary: "Hello",
      sessionKey: "session-a",
    });
    store.upsertTimeline({
      id: "assistant-response-1",
      kind: "agent.assistant",
      timestamp: "2026-07-13T10:00:01.000Z",
      title: "Assistant response",
      summary: "Hello world",
      sessionKey: "session-a",
    });

    expect(store.listTimeline()).toEqual([
      expect.objectContaining({
        id: "assistant-response-1",
        timestamp,
        title: "Assistant response",
        summary: "Hello world",
      }),
    ]);
    store.close();
  });
});
