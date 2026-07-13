import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "@dashclaw/runtime-model";
import { upsertTimelineEvent } from "./timeline";

const event = (id: string, summary: string): TimelineEvent => ({
  id,
  kind: "agent.assistant",
  timestamp: "2026-07-13T10:00:00.000Z",
  title: "Assistant responding",
  summary,
});

describe("upsertTimelineEvent", () => {
  it("replaces a same-id stream event in place", () => {
    const current = [event("before", "before"), event("response", "H"), event("after", "after")];
    const next = upsertTimelineEvent(current, event("response", "Hello"), 200);
    expect(next.map((item) => item.id)).toEqual(["before", "response", "after"]);
    expect(next[1]?.summary).toBe("Hello");
  });

  it("caps only newly appended events", () => {
    const next = upsertTimelineEvent([event("one", "1"), event("two", "2")], event("three", "3"), 2);
    expect(next.map((item) => item.id)).toEqual(["two", "three"]);
  });
});
