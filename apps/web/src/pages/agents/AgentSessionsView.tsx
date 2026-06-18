import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAppState } from "../../context";
import { OfficeBreadcrumb } from "./OfficeBreadcrumb";
import { AgentAvatar } from "./AgentAvatar";
import { StatusChip } from "./Chips";
import { SessionCard } from "./SessionCard";
import { buildAgentStats } from "./utils";

type SessionFilter = "all" | "active" | "recent";

const FILTERS: Array<{ id: SessionFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Live" },
  { id: "recent", label: "24h" },
];

export function AgentSessionsView() {
  const { agentId: rawAgentId } = useParams();
  const agentId = rawAgentId ? decodeURIComponent(rawAgentId) : "";
  const { snapshot } = useAppState();
  const [filter, setFilter] = useState<SessionFilter>("all");

  const stats = useMemo(() => {
    if (!snapshot || !agentId) return null;
    const agent = snapshot.agents.find((a) => a.id === agentId);
    if (!agent) return null;
    return buildAgentStats(snapshot, agent);
  }, [snapshot, agentId]);

  if (!snapshot) return <p className="office-loading">Loading…</p>;
  if (!stats) {
    return (
      <div className="office-page">
        <OfficeBreadcrumb items={[{ label: "Agent Office", to: "/agents" }, { label: agentId || "Unknown" }]} />
        <p className="badge error">Agent not found</p>
        <Link className="office-back" to="/agents">← All agents</Link>
      </div>
    );
  }

  const sessions = stats.sessions.filter((session) => {
    if (filter === "active") return session.isActive;
    if (filter === "recent") {
      const ms = Date.parse(session.updatedAt ?? session.lastInteractionAt ?? "");
      return !Number.isNaN(ms) && Date.now() - ms < 24 * 60 * 60_000;
    }
    return true;
  });

  const primarySession = stats.activeSessions[0];

  return (
    <div className="office-page">
      <OfficeBreadcrumb
        items={[
          { label: "Agent Office", to: "/agents" },
          { label: stats.agent.name ?? stats.agent.id },
        ]}
      />

      <header className={`office-hero agent-hero ${stats.isWorking ? "is-live" : ""}`}>
        <AgentAvatar agent={stats.agent} size="lg" />
        <div className="agent-hero-copy">
          <div className="agent-hero-title-row">
            <h1 className="page-title">{stats.agent.name ?? stats.agent.id}</h1>
            <StatusChip label={stats.isWorking ? "working" : "idle"} tone={stats.isWorking ? "ok" : "neutral"} pulse={stats.isWorking} />
          </div>
          <p className="office-subtitle mono">{stats.agent.model ?? "default model"}</p>
          <div className="agent-hero-metrics">
            <span className="metric-pill">{stats.sessions.length} sessions</span>
            {stats.activeSessions.length > 0 ? (
              <span className="metric-pill metric-live">{stats.activeSessions.length} live</span>
            ) : null}
          </div>
        </div>
      </header>

      {stats.isWorking && primarySession ? (
        <Link
          className="live-banner"
          to={`/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(primarySession.key)}`}
        >
          <span className="live-banner-label">Live now</span>
          <strong>{stats.currentLabel ?? "Active run in progress"}</strong>
          {stats.currentTool ? <span className="mono live-banner-tool">{stats.currentTool}</span> : null}
          <span className="live-banner-arrow" aria-hidden>→</span>
        </Link>
      ) : null}

      <div className="office-toolbar">
        <div className="segmented-control">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`segment ${filter === id ? "is-active" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="office-muted">{sessions.length} shown</span>
      </div>

      {sessions.length === 0 ? (
        <p className="empty">No sessions match this filter</p>
      ) : (
        <div className="session-grid">
          {sessions.map((session) => (
            <SessionCard key={session.key} session={session} agentId={agentId} />
          ))}
        </div>
      )}
    </div>
  );
}
