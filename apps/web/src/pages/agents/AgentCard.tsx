import { Link } from "react-router-dom";
import type { AgentOfficeStats } from "./utils";
import { AgentAvatar } from "./AgentAvatar";
import { StatusChip } from "./Chips";
import { formatRelativeTime } from "./utils";
import { WorktreeMetadata } from "./WorktreeMetadata";

export function AgentCard({ stats }: { stats: AgentOfficeStats }) {
  return (
    <Link
      to={`/agents/${encodeURIComponent(stats.agent.id)}`}
      className={`agent-card ${stats.isWorking ? "is-working" : "is-idle"}`}
    >
      <div className="agent-card-glow" aria-hidden />

      <div className="agent-card-top">
        <AgentAvatar agent={stats.agent} size="lg" />
        <div className="agent-card-id">
          <h2>{stats.agent.name ?? stats.agent.id}</h2>
          <p className="mono">{stats.agent.model ?? "default model"}</p>
        </div>
        <StatusChip label={stats.isWorking ? "working" : "idle"} tone={stats.isWorking ? "ok" : "neutral"} pulse={stats.isWorking} />
      </div>

      <div className="agent-card-body">
        {stats.isWorking ? (
          <div className="agent-card-activity">
            <span className="agent-card-activity-label">Now</span>
            <strong>{stats.currentLabel ?? "Active run"}</strong>
            {stats.currentTool ? <span className="mono agent-card-tool">↳ {stats.currentTool}</span> : null}
            <WorktreeMetadata worktree={stats.primarySession?.worktree} />
          </div>
        ) : (
          <div className="agent-card-idle-msg">Standing by — no active runs</div>
        )}
      </div>

      <div className="agent-card-footer">
        <div className="agent-card-metrics">
          {stats.activeSessions.length > 0 ? (
            <span className="metric-pill metric-live">{stats.activeSessions.length} live</span>
          ) : null}
          <span className="metric-pill">{stats.sessions.length} sessions</span>
        </div>
        <span className="agent-card-time">
          {formatRelativeTime(
            stats.primarySession?.updatedAt ??
              stats.sessions[0]?.updatedAt ??
              stats.sessions[0]?.lastInteractionAt,
          )}
        </span>
        <span className="agent-card-arrow" aria-hidden>→</span>
      </div>
    </Link>
  );
}
