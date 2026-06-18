import { useParams } from "react-router-dom";
import { useAppState } from "../../context";
import { OfficeBreadcrumb } from "./OfficeBreadcrumb";
import { SessionPreviewPanel } from "./SessionPreviewPanel";
import { AgentAvatar } from "./AgentAvatar";
import { KindChip, StatusChip } from "./Chips";
import {
  formatClock,
  parseSessionKind,
  sessionDisplayName,
  sessionStatusLabel,
  sessionStatusTone,
} from "./utils";

export function AgentSessionDetail() {
  const { agentId: rawAgentId, sessionKey: rawSessionKey } = useParams();
  const agentId = rawAgentId ? decodeURIComponent(rawAgentId) : "";
  const sessionKey = rawSessionKey ? decodeURIComponent(rawSessionKey) : "";
  const { snapshot, timeline } = useAppState();

  const agent = snapshot?.agents.find((a) => a.id === agentId);
  const session = snapshot?.sessions.find((s) => s.key === sessionKey);
  const sessionEvents = timeline.filter((event) => event.sessionKey === sessionKey).slice(-30).reverse();

  if (!snapshot) return <p className="office-loading">Loading…</p>;
  if (!agent || !session) {
    return (
      <div className="office-page">
        <OfficeBreadcrumb
          items={[
            { label: "Agent Office", to: "/agents" },
            { label: agentId, to: agentId ? `/agents/${encodeURIComponent(agentId)}` : undefined },
            { label: "Session" },
          ]}
        />
        <p className="badge error">Session not found</p>
      </div>
    );
  }

  const kind = parseSessionKind(session.key);

  return (
    <div className="office-page">
      <OfficeBreadcrumb
        items={[
          { label: "Agent Office", to: "/agents" },
          { label: agent.name ?? agent.id, to: `/agents/${encodeURIComponent(agentId)}` },
          { label: sessionDisplayName(session) },
        ]}
      />

      <header className={`session-detail-hero ${session.isActive ? "is-live" : ""}`}>
        <div className="session-detail-hero-main">
          <KindChip kind={kind} />
          <h1 className="page-title">{sessionDisplayName(session)}</h1>
          <p className="office-subtitle mono">{session.key}</p>
        </div>
        <StatusChip
          label={sessionStatusLabel(session)}
          tone={sessionStatusTone(session)}
          pulse={session.isActive}
        />
      </header>

      <div className="detail-pill-row">
        <div className="detail-pill">
          <span>Agent</span>
          <strong className="detail-pill-value">
            <AgentAvatar agent={agent} size="sm" />
            {agent.name ?? agent.id}
          </strong>
        </div>
        <div className="detail-pill">
          <span>Model</span>
          <strong className="detail-pill-value mono">{session.model ?? agent.model ?? "—"}</strong>
        </div>
        <div className="detail-pill">
          <span>Tool</span>
          <strong className="detail-pill-value mono">{session.currentTool ?? "—"}</strong>
        </div>
        <div className="detail-pill">
          <span>Updated</span>
          <strong className="detail-pill-value">{formatClock(session.updatedAt ?? session.lastInteractionAt)}</strong>
        </div>
      </div>

      <div className="session-detail-layout">
        <section className="card session-detail-panel">
          <h3>Live stream</h3>
          {sessionEvents.length === 0 ? (
            <p className="empty">No events for this session yet</p>
          ) : (
            <div className="event-rail">
              {sessionEvents.map((event, index) => (
                <div key={event.id} className="event-rail-item">
                  <div className="event-rail-track">
                    <span className={`event-rail-dot ${index === 0 && session.isActive ? "is-live" : ""}`} />
                    {index < sessionEvents.length - 1 ? <span className="event-rail-line" /> : null}
                  </div>
                  <div className="event-rail-body">
                    <div className="event-rail-meta">
                      <span className="mono">{new Date(event.timestamp).toLocaleTimeString()}</span>
                      <span className="badge neutral">{event.kind}</span>
                    </div>
                    <strong>{event.title}</strong>
                    {event.summary ? <p className="office-muted">{event.summary}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card session-detail-panel session-detail-convo">
          <h3>Conversation</h3>
          <SessionPreviewPanel sessionKey={session.key} isActive={session.isActive} />
        </section>
      </div>
    </div>
  );
}
