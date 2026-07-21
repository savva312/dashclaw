import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSessionPreview } from "../../api";
import { runtimeKeys, RUNTIME_POLL_MS } from "../../queries";
import { EmptyState, Skeleton } from "../../ui";
import { formatPreviewText } from "./utils";
import type { TimelineEvent } from "@dashclaw/runtime-model";
import type { SessionPreviewItem as PreviewItem } from "../../validation";

export function mergePreviewWithAssistantEvents(
  previewItems: PreviewItem[],
  assistantEvents: TimelineEvent[],
): PreviewItem[] {
  const previewAssistantText = new Set(
    previewItems
      .filter((item) => item.role === "assistant" && !item.id)
      .map((item) => formatPreviewText(item.text ?? "", "assistant")),
  );
  const previewIds = new Set(previewItems.map((item) => item.id).filter((id): id is string => Boolean(id)));
  const seenResponseIds = new Set<string>();
  const liveItems: PreviewItem[] = assistantEvents
    .filter((event) => {
      const text = formatPreviewText(event.summary ?? "", "assistant");
      const responseId = typeof event.payload?.responseId === "string" ? event.payload.responseId : undefined;
      if (!text || previewIds.has(event.id) || (responseId ? previewIds.has(responseId) : previewAssistantText.has(text))) {
        return false;
      }
      if (responseId) {
        if (seenResponseIds.has(responseId)) return false;
        seenResponseIds.add(responseId);
      } else {
        previewAssistantText.add(text);
      }
      return true;
    })
    .map((event) => ({
      id: typeof event.payload?.responseId === "string" ? event.payload.responseId : event.id,
      role: "assistant",
      text: event.summary,
    }));
  return [...previewItems, ...liveItems];
}

function truncate(text: string, max = 900): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function PreviewBubble({ item }: { item: PreviewItem }) {
  const [expanded, setExpanded] = useState(false);
  const role = item.role ?? "unknown";
  const formatted = formatPreviewText(item.text ?? "", role);
  const long = formatted.length > 420;

  return (
    <div className={`preview-bubble role-${role}`}>
      <div className="preview-bubble-head">
        <span className="preview-bubble-role">{role}</span>
      </div>
      <div className={`preview-bubble-body ${expanded ? "is-expanded" : ""}`}>
        <pre>{expanded ? formatted : truncate(formatted, 420)}</pre>
      </div>
      {long ? (
        <button type="button" className="preview-expand" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

export function SessionPreviewPanel({
  sessionKey,
  isActive,
  assistantEvents = [],
}: {
  sessionKey: string;
  isActive?: boolean;
  assistantEvents?: TimelineEvent[];
}) {
  const previewQuery = useQuery({
    queryKey: runtimeKeys.sessionPreview(sessionKey),
    queryFn: () => fetchSessionPreview(sessionKey),
    refetchInterval: isActive ? RUNTIME_POLL_MS : false,
  });

  if (previewQuery.isLoading && !previewQuery.data && assistantEvents.length === 0) {
    return <Skeleton lines={3} />;
  }

  if (previewQuery.error && assistantEvents.length === 0) {
    return (
      <p className="badge error">
        {previewQuery.error instanceof Error ? previewQuery.error.message : "Failed to load preview"}
      </p>
    );
  }

  const previewItems = previewQuery.data?.previews?.[0]?.items ?? [];
  const items = mergePreviewWithAssistantEvents(previewItems, assistantEvents);
  if (items.length === 0) {
    return (
      <EmptyState
        title="No messages yet"
        hint="Conversation preview will appear when this session has activity."
      />
    );
  }

  return (
    <div className="session-preview-panel">
      {previewQuery.error ? (
        <span className="badge error">
          Preview history unavailable; showing live responses.
        </span>
      ) : null}
      {previewQuery.isFetching && !previewQuery.isLoading ? (
        <span className="preview-refreshing">Updating…</span>
      ) : null}
      <div className="session-preview-list">
        {items.map((item, index) => (
          <PreviewBubble key={item.id ?? `${item.role}-${index}`} item={item} />
        ))}
      </div>
    </div>
  );
}
