import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAppState } from "../../context";
import { AgentCard } from "./AgentCard";
import { AgentAvatar } from "./AgentAvatar";
import { WorktreeMetadata } from "./WorktreeMetadata";
import { agentMatchesQuery, buildAllAgentStats } from "./utils";
import {
  Badge,
  Breadcrumb,
  EmptyState,
  LiveIndicator,
  PageHeader,
  SearchField,
  SegmentedControl,
  Skeleton,
  StatStrip,
} from "../../ui";

type AgentFilter = "all" | "working" | "idle";

export function AgentOverview() {
  const { snapshot, liveConnected } = useAppState();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AgentFilter>("all");

  const rows = useMemo(() => (snapshot ? buildAllAgentStats(snapshot) : []), [snapshot]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (filter === "working" && !row.isWorking) return false;
      if (filter === "idle" && row.isWorking) return false;
      return agentMatchesQuery(row.agent, query);
    });
  }, [rows, filter, query]);

  const working = rows.filter((row) => row.isWorking);

  if (!snapshot) {
    return (
      <div className="page-shell office-page">
        <Skeleton lines={3} className="office-page-skeleton" />
      </div>
    );
  }

  return (
    <div className="page-shell office-page">
      <Breadcrumb items={[{ label: "Agent Office" }]} />

      <PageHeader
        title="Agent Office"
        subtitle="Fleet overview — drill into any agent to inspect sessions."
        badge={<LiveIndicator live={liveConnected} />}
        aside={
          <StatStrip
            items={[
              { label: "working", value: working.length, tone: "live" },
              { label: "idle", value: rows.length - working.length },
              { label: "total", value: rows.length },
            ]}
          />
        }
      />

      {working.length > 0 ? (
        <section className="live-fleet">
          <div className="section-head">
            <h2>Live fleet</h2>
            <span className="office-muted">{working.length} active</span>
          </div>
          <div className="live-fleet-scroll">
            {working.map((row) => {
              const session = row.primarySession;
              const target = session
                ? `/agents/${encodeURIComponent(row.agent.id)}/sessions/${encodeURIComponent(session.key)}`
                : `/agents/${encodeURIComponent(row.agent.id)}`;
              return (
                <Link key={row.agent.id} className="live-fleet-chip" to={target}>
                  <AgentAvatar agent={row.agent} size="sm" />
                  <div>
                    <strong>{row.agent.name ?? row.agent.id}</strong>
                    <span>{row.currentLabel ?? "Working"}</span>
                    <WorktreeMetadata worktree={session?.worktree} />
                  </div>
                  <Badge tone="live" pulse>
                    live
                  </Badge>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="office-toolbar office-toolbar-stack">
        <SearchField value={query} onChange={setQuery} placeholder="Search agents…" />
        <div className="office-toolbar-row">
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "working", label: "Working" },
              { value: "idle", label: "Idle" },
            ]}
          />
          <span className="office-muted">{filtered.length} shown</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No agents configured" hint="Agents appear when the gateway reports agents.list." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" hint="Try a different search or filter." />
      ) : (
        <div className="agent-grid">
          {filtered.map((row) => (
            <AgentCard key={row.agent.id} stats={row} />
          ))}
        </div>
      )}
    </div>
  );
}
