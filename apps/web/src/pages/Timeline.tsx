import { Link } from "react-router-dom";
import { useAppState } from "../context";
import { formatCompactTitle } from "../lib/format";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

export function TimelinePage() {
  const { timeline } = useAppState();
  const events = [...timeline]
    .filter((e) => e.kind !== "health" && e.kind !== "presence" && e.kind !== "heartbeat")
    .reverse();

  return (
    <div className="page-shell timeline-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Live Timeline</h1>
          <p className="page-subtitle">Unified runtime event stream from the OpenClaw Gateway.</p>
        </div>
      </div>

      <div className="card timeline-panel">
        {events.length === 0 ? (
          <p className="empty">No events yet. Events appear when the Gateway is connected and active.</p>
        ) : (
          <div className="timeline-list timeline-list-page">
            {events.map((e) => (
              <div key={e.id} className="timeline-item">
                <div className="timeline-time">{formatTime(e.timestamp)}</div>
                <div className="timeline-body">
                  <div className="timeline-head">
                    <span className="badge neutral timeline-kind-badge">{e.kind}</span>
                    <strong className="text-clamp-2" title={e.title}>{formatCompactTitle(e.title, 96)}</strong>
                  </div>
                  {e.summary ? <div className="timeline-summary text-clamp-2">{e.summary}</div> : null}
                  {(e.sessionKey || e.agentId || e.taskId || e.runId) ? (
                    <div className="ops-item-meta timeline-meta">
                      {e.agentId ? <Link to={`/agents/${encodeURIComponent(e.agentId)}`}>agent:{e.agentId}</Link> : null}
                      {e.agentId && e.sessionKey ? (
                        <Link to={`/agents/${encodeURIComponent(e.agentId)}/sessions/${encodeURIComponent(e.sessionKey)}`}>
                          session
                        </Link>
                      ) : e.sessionKey ? (
                        <span className="mono text-clip">session:{e.sessionKey}</span>
                      ) : null}
                      {e.taskId ? <Link to={`/tasks/${encodeURIComponent(e.taskId)}`}>task</Link> : null}
                      {e.runId ? <span className="mono text-clip">run:{e.runId}</span> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
