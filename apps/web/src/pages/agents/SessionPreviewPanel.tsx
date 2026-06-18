import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSessionPreview } from "../../api";
import { runtimeKeys, RUNTIME_POLL_MS } from "../../queries";
import { EmptyState, Skeleton } from "../../ui";
import { formatPreviewText } from "./utils";

interface PreviewItem {
  role?: string;
  text?: string;
}

interface SessionPreviewData {
  previews?: Array<{
    key?: string;
    status?: string;
    items?: PreviewItem[];
  }>;
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
}: {
  sessionKey: string;
  isActive?: boolean;
}) {
  const previewQuery = useQuery({
    queryKey: runtimeKeys.sessionPreview(sessionKey),
    queryFn: () => fetchSessionPreview(sessionKey) as Promise<SessionPreviewData>,
    refetchInterval: isActive ? RUNTIME_POLL_MS : false,
  });

  if (previewQuery.isLoading && !previewQuery.data) {
    return <Skeleton lines={3} />;
  }

  if (previewQuery.error) {
    return (
      <p className="badge error">
        {previewQuery.error instanceof Error ? previewQuery.error.message : "Failed to load preview"}
      </p>
    );
  }

  const items = previewQuery.data?.previews?.[0]?.items ?? [];
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
      {previewQuery.isFetching && !previewQuery.isLoading ? (
        <span className="preview-refreshing">Updating…</span>
      ) : null}
      <div className="session-preview-list">
        {items.map((item, index) => (
          <PreviewBubble key={`${item.role}-${index}`} item={item} />
        ))}
      </div>
    </div>
  );
}
