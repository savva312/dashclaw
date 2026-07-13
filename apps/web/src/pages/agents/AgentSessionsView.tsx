import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAppState } from "../../context";
import { AgentAvatar } from "./AgentAvatar";
import { StatusChip } from "./Chips";
import { SessionCard } from "./SessionCard";
import { WorktreeMetadata } from "./WorktreeMetadata";
import {
  buildAgentStats,
  groupSessionsByKind,
  kindLabel,
  parseSessionKind,
  sessionMatchesQuery,
} from "./utils";
import { Breadcrumb, EmptyState, SearchField, SegmentedControl } from "../../ui";

type SessionFilter = "all" | "active" | "recent";

export function AgentSessionsView() {
  const { agentId: rawAgentId } = useParams();
  const agentId = rawAgentId ? decodeURIComponent(rawAgentId) : "";
  const { snapshot } = useAppState();
  const [filter, setFilter] = useState<SessionFilter>("all");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");

  const stats = useMemo(() => {
    if (!snapshot || !agentId) return null;
    const agent = snapshot.agents.find((a) => a.id === agentId);
    if (!agent) return null;
    return buildAgentStats(snapshot, agent);
  }, [snapshot, agentId]);

  const availableKinds = useMemo(() => {
    if (!stats) return [];
    return [...new Set(stats.sessions.map((s) => parseSessionKind(s.key)))].sort();
  }, [stats]);

  const sessions = useMemo(() => {
    if (!stats) return [];
    return stats.sessions.filter((session) => {
      if (filter === "active" && !session.isActive) return false;
      if (filter === "recent") {
        const ms = Date.parse(session.updatedAt ?? session.lastInteractionAt ?? "");
        if (Number.isNaN(ms) || Date.now() - ms >= 24 * 60 * 60_000) return false;
      }
      if (kindFilter !== "all" && parseSessionKind(session.key) !== kindFilter) return false;
      return sessionMatchesQuery(session, query);
    });
  }, [stats, filter, kindFilter, query]);

  const grouped = useMemo(() => {
    const active = sessions.filter((s) => s.isActive);
    const rest = sessions.filter((s) => !s.isActive);
    const sections: Array<{ title: string; sessions: typeof sessions }> = [];
    if (active.length > 0) sections.push({ title: "Live now", sessions: active });
    for (const group of groupSessionsByKind(rest)) {
      sections.push({ title: kindLabel(group.kind), sessions: group.sessions });
    }
    return sections.filter((section) => section.sessions.length > 0);
  }, [sessions]);

  if (!snapshot) return <p className="office-loading">Loading…</p>;
  if (!stats) {
    return (
      <div className="page-shell office-page">
        <Breadcrumb items={[{ label: "Agent Office", to: "/agents" }, { label: agentId || "Unknown" }]} />
        <EmptyState title="Agent not found" hint="It may have been removed from the gateway config." />
        <Link className="office-back" to="/agents">
          ← All agents
        </Link>
      </div>
    );
  }

  const primarySession = stats.primarySession;

  return (
    <div className="page-shell office-page">
      <Link className="office-back" to="/agents">
        ← All agents
      </Link>
      <Breadcrumb
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
          <WorktreeMetadata worktree={primarySession.worktree} />
          <span className="live-banner-arrow" aria-hidden>→</span>
        </Link>
      ) : null}

      <div className="office-toolbar office-toolbar-stack">
        <SearchField value={query} onChange={setQuery} placeholder="Search sessions…" />
        <div className="office-toolbar-row">
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Live" },
              { value: "recent", label: "24h" },
            ]}
          />
          <span className="office-muted">{sessions.length} shown</span>
        </div>
        {availableKinds.length > 1 ? (
          <div className="kind-filter-row">
            <button
              type="button"
              className={`kind-filter ${kindFilter === "all" ? "is-active" : ""}`}
              onClick={() => setKindFilter("all")}
            >
              All types
            </button>
            {availableKinds.map((kind) => (
              <button
                key={kind}
                type="button"
                className={`kind-filter kind-filter-${kind} ${kindFilter === kind ? "is-active" : ""}`}
                onClick={() => setKindFilter(kind)}
              >
                {kindLabel(kind)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {sessions.length === 0 ? (
        <EmptyState title="No sessions match" hint="Try another filter or search term." />
      ) : (
        <div className="session-sections">
          {grouped.map((section) => (
            <section key={section.title} className="session-section">
              <div className="section-head">
                <h2>{section.title}</h2>
                <span className="office-muted">{section.sessions.length}</span>
              </div>
              <div className="session-grid">
                {section.sessions.map((session) => (
                  <SessionCard key={session.key} session={session} agentId={agentId} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
