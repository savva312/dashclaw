import { Link } from "react-router-dom";
import type { SessionSummary } from "@dashclaw/runtime-model";
import { KindChip, StatusChip } from "./Chips";
import { ExecutionContext } from "./ExecutionContext";
import { SessionOperationalBadges } from "./SessionOperational";
import {
  formatRelativeTime,
  parseSessionKind,
  sessionDisplayName,
  sessionStatusLabel,
  sessionStatusTone,
  shortSessionKey,
} from "./utils";

export function SessionCard({
  session,
  agentId,
}: {
  session: SessionSummary;
  agentId: string;
}) {
  const kind = parseSessionKind(session.key);

  return (
    <Link
      to={`/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(session.key)}`}
      className={`session-card ${session.isActive ? "is-active" : ""}`}
    >
      <div className="session-card-accent" aria-hidden />

      <div className="session-card-head">
        <KindChip kind={kind} />
        <StatusChip
          label={sessionStatusLabel(session)}
          tone={sessionStatusTone(session)}
          pulse={session.isActive}
        />
      </div>

      <h3 className="session-card-title">{sessionDisplayName(session)}</h3>
      <p className="session-card-key mono" title={session.key}>
        {session.label ? shortSessionKey(session.key) : session.key}
      </p>

      {session.currentTool ? (
        <div className="session-card-tool">
          <span className="session-card-tool-label">Tool</span>
          <span className="mono">{session.currentTool}</span>
        </div>
      ) : null}

      <SessionOperationalBadges session={session} />

      <ExecutionContext session={session} />

      <div className="session-card-footer">
        <span>{formatRelativeTime(session.updatedAt ?? session.lastInteractionAt)}</span>
        <span className="session-card-arrow" aria-hidden>→</span>
      </div>
    </Link>
  );
}
