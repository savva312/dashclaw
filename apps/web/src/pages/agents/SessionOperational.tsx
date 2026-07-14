import type { SessionSummary } from "@dashclaw/runtime-model";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface SessionOperationalBadge {
  label: string;
  tone: "ok" | "error" | "warn" | "neutral";
}

export function sessionOperationalBadges(session: SessionSummary): SessionOperationalBadge[] {
  const badges: SessionOperationalBadge[] = [];
  const terminalStatus = ["completed", "failed", "cancelled", "timeout", "timed_out"].includes(session.status ?? "");
  const subagentState = session.subagentRunState?.toLowerCase();
  const isReportedSubagent =
    session.kind === "subagent" ||
    session.spawnDepth !== undefined ||
    session.subagentRole !== undefined ||
    session.subagentRunState !== undefined;
  const hasReportedParent = Boolean(session.parentSessionKey || session.spawnedBy || session.ownerSessionKey);

  if (session.abortedLastRun) badges.push({ label: "last run aborted", tone: "error" });
  if (subagentState === "failed" || subagentState === "error" || subagentState === "aborted") {
    badges.push({ label: `subagent ${subagentState}`, tone: "error" });
  } else if (session.hasActiveSubagentRun) {
    badges.push({ label: "subagent active", tone: "ok" });
  }
  if (session.hasActiveRun && terminalStatus) {
    badges.push({ label: "active run with terminal status", tone: "warn" });
  }
  if (isReportedSubagent && !hasReportedParent) {
    badges.push({ label: "parent not reported", tone: "warn" });
  }

  return badges;
}

export function SessionOperationalBadges({ session }: { session: SessionSummary }) {
  const badges = sessionOperationalBadges(session);
  if (badges.length === 0) return null;
  return (
    <div className="session-operational-badges" aria-label="Session operational signals">
      {badges.map((badge) => (
        <span key={badge.label} className={`badge ${badge.tone}`}>{badge.label}</span>
      ))}
    </div>
  );
}

export function SessionOperationalDetails({
  session,
  sessions,
}: {
  session: SessionSummary;
  sessions: SessionSummary[];
}) {
  return (
    <div className="session-evidence-grid" aria-label="Session runtime and lineage evidence">
      <EvidenceSection title="Lifecycle">
        <EvidenceRow label="Started" value={formatTimestamp(session.startedAt)} />
        <EvidenceRow label="Ended" value={formatTimestamp(session.endedAt)} />
        <EvidenceRow label="Runtime" value={formatDuration(session.runtimeMs)} />
        <EvidenceRow label="Status" value={session.status} />
        <EvidenceRow label="Active run" value={formatBoolean(session.hasActiveRun)} />
        <EvidenceRow label="Active subagent" value={formatBoolean(session.hasActiveSubagentRun)} />
        <EvidenceRow label="Subagent state" value={session.subagentRunState} />
        <EvidenceRow label="Last run aborted" value={formatBoolean(session.abortedLastRun)} attention={session.abortedLastRun} />
      </EvidenceSection>

      <EvidenceSection title="Runtime identity">
        <EvidenceRow label="Model" value={session.model} mono />
        <EvidenceRow label="Provider" value={session.modelProvider} />
        <EvidenceRow label="Runtime" value={session.agentRuntime} mono />
        <EvidenceRow label="Runtime source" value={session.agentRuntimeSource} />
        <EvidenceRow label="Session ID" value={session.sessionId} mono />
        <EvidenceRow label="Kind" value={session.kind} />
      </EvidenceSection>

      <EvidenceSection title="Lineage">
        <SessionReferenceRow label="Parent session" sessionKey={session.parentSessionKey} sessions={sessions} />
        <SessionReferenceRow label="Spawned by" sessionKey={session.spawnedBy} sessions={sessions} />
        <SessionReferenceRow label="Owner session" sessionKey={session.ownerSessionKey} sessions={sessions} />
        <EvidenceRow label="Spawn depth" value={session.spawnDepth?.toString()} />
        <EvidenceRow label="Subagent role" value={session.subagentRole} />
        <EvidenceRow label="Control scope" value={session.subagentControlScope} />
        <EvidenceRow label="Forked from parent" value={formatBoolean(session.forkedFromParent)} />
      </EvidenceSection>

      <EvidenceSection title="Delivery">
        <EvidenceRow label="Channel" value={session.deliveryContext?.channel} />
        <EvidenceRow label="Destination" value={session.deliveryContext?.to} mono />
        <EvidenceRow label="Account" value={session.deliveryContext?.accountId} mono />
        <EvidenceRow label="Thread" value={session.deliveryContext?.threadId} mono />
      </EvidenceSection>

      <EvidenceSection title="Origin">
        <EvidenceRow label="Provider" value={session.origin?.provider} />
        <EvidenceRow label="Surface" value={session.origin?.surface} />
        <EvidenceRow label="Chat type" value={session.origin?.chatType} />
        <EvidenceRow label="Account" value={session.origin?.accountId} mono />
        <EvidenceRow label="Channel" value={session.origin?.channelId} mono />
        <EvidenceRow label="Thread" value={session.origin?.threadId} mono />
      </EvidenceSection>
    </div>
  );
}

function EvidenceSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="session-evidence-section">
      <h3>{title}</h3>
      <dl className="session-evidence-list">{children}</dl>
    </section>
  );
}

function EvidenceRow({
  label,
  value,
  mono = false,
  attention = false,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  attention?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={`${mono ? "mono" : ""}${attention ? " session-evidence-attention" : ""}`.trim()}>
        {value ?? "not reported"}
      </dd>
    </div>
  );
}

function SessionReferenceRow({
  label,
  sessionKey,
  sessions,
}: {
  label: string;
  sessionKey?: string;
  sessions: SessionSummary[];
}) {
  const referenced = sessionKey ? sessions.find((candidate) => candidate.key === sessionKey) : undefined;
  if (!sessionKey) return <EvidenceRow label={label} />;
  const value = referenced?.agentId ? (
    <Link to={`/agents/${encodeURIComponent(referenced.agentId)}/sessions/${encodeURIComponent(sessionKey)}`}>
      {sessionKey}
    </Link>
  ) : (
    <>{sessionKey} <span className="session-evidence-muted">(not in snapshot)</span></>
  );
  return (
    <div>
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
}

function formatBoolean(value: boolean | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value ? "yes" : "no";
}

function formatTimestamp(value?: string): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toLocaleString();
}

function formatDuration(runtimeMs?: number): string | undefined {
  if (runtimeMs === undefined) return undefined;
  if (runtimeMs < 1_000) return `${runtimeMs} ms`;
  const totalSeconds = Math.floor(runtimeMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", `${seconds}s`].filter(Boolean).join(" ");
}
