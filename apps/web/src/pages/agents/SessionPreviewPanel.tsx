import { useEffect, useState } from "react";
import { fetchSessionPreview } from "../../api";

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

function truncate(text: string, max = 1200): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function SessionPreviewPanel({
  sessionKey,
  isActive,
}: {
  sessionKey: string;
  isActive?: boolean;
}) {
  const [preview, setPreview] = useState<SessionPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = (await fetchSessionPreview(sessionKey)) as SessionPreviewData;
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    if (!isActive) return () => {
      cancelled = true;
    };

    const timer = setInterval(() => {
      void load();
    }, 3_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionKey, isActive]);

  if (loading && !preview) return <p className="empty">Loading conversation preview…</p>;
  if (error) return <p className="badge error">{error}</p>;

  const items = preview?.previews?.[0]?.items ?? [];
  if (items.length === 0) return <p className="empty">No messages in preview yet.</p>;

  return (
    <div className="session-preview-list">
      {items.map((item, index) => (
        <div key={`${item.role}-${index}`} className={`session-preview-item role-${item.role ?? "unknown"}`}>
          <div className="session-preview-role">{item.role ?? "unknown"}</div>
          <pre className="session-preview-text">{truncate(item.text ?? "")}</pre>
        </div>
      ))}
    </div>
  );
}
