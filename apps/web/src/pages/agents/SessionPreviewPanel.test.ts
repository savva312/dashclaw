import { describe, expect, it } from "vitest";
import { mergePreviewWithAssistantEvents } from "./SessionPreviewPanel";

describe("mergePreviewWithAssistantEvents", () => {
  it("adds one growing assistant bubble and removes it once preview catches up", () => {
    const live = [{
      id: "response-1",
      kind: "agent.assistant" as const,
      timestamp: "2026-07-13T10:00:00.000Z",
      title: "Assistant responding",
      summary: "Readable response",
    }];

    expect(mergePreviewWithAssistantEvents([{ role: "user", text: "Question" }], live)).toEqual([
      { role: "user", text: "Question" },
      { id: "response-1", role: "assistant", text: "Readable response" },
    ]);
    expect(
      mergePreviewWithAssistantEvents(
        [{ role: "assistant", text: "Readable response" }],
        live,
      ),
    ).toEqual([{ role: "assistant", text: "Readable response" }]);
  });
});
