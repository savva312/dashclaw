import { useAppState } from "../context";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

export function TimelinePage() {
  const { timeline } = useAppState();

  return (
    <>
      <h1 className="page-title">Live Timeline</h1>
      <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
        Unified runtime event stream from the OpenClaw Gateway.
      </p>
      <div className="timeline-list">
        {timeline.length === 0 ? (
          <p className="empty">No events yet. Events appear when the Gateway is connected and active.</p>
        ) : (
          [...timeline]
            .filter((e) => e.kind !== "health" && e.kind !== "presence" && e.kind !== "heartbeat")
            .reverse()
            .map((e) => (
            <div key={e.id} className="timeline-item">
              <div className="timeline-time">{formatTime(e.timestamp)}</div>
              <div className="timeline-kind">{e.kind}</div>
              <div>
                <strong>{e.title}</strong>
                {e.summary && <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{e.summary}</div>}
                {(e.sessionKey || e.agentId) && (
                  <div className="mono" style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    {e.agentId && `agent:${e.agentId} `}
                    {e.sessionKey && `session:${e.sessionKey}`}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
