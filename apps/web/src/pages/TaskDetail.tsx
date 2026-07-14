import { Link, useParams } from "react-router-dom";
import { useMemo, type ReactNode } from "react";
import { useAppState } from "../context";
import type { SessionSummary } from "@dashclaw/runtime-model";
import {
  buildTaskDetailModel,
  type DeliveryRecoveryState,
  type TaskNarrativeEvidence,
} from "../runtime/dashboard";
import { Badge, EmptyState, Panel, PanelHeader } from "../ui";

function formatClock(iso?: string): string {
  if (!iso) return "-";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString();
}

function formatDuration(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms)) return "unavailable";
  if (ms < 1_000) return `${ms} ms`;
  const totalSeconds = Math.floor(ms / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", seconds || (!hours && !minutes) ? `${seconds}s` : ""]
    .filter(Boolean)
    .join(" ");
}

function taskTone(status: string): "ok" | "warn" | "error" | "neutral" {
  if (status === "running") return "ok";
  if (status === "queued") return "warn";
  if (status === "failed" || status === "timed_out") return "error";
  return "neutral";
}

function eventTone(kind: string): "ok" | "warn" | "error" | "neutral" {
  if (kind.includes("approval")) return "warn";
  if (kind.includes("tool")) return "warn";
  if (kind.includes("gateway.disconnected") || kind.includes("failed")) return "error";
  if (kind.includes("lifecycle") || kind.includes("message")) return "ok";
  return "neutral";
}

export function TaskDetailPage() {
  const { taskId: rawTaskId } = useParams();
  const taskId = rawTaskId ? decodeURIComponent(rawTaskId) : "";
  const { snapshot, timeline } = useAppState();
  const detail = useMemo(
    () => (snapshot && taskId ? buildTaskDetailModel(snapshot, timeline, taskId) : null),
    [snapshot, taskId, timeline],
  );

  if (!snapshot) return <p>Loading...</p>;

  if (!detail) {
    return (
      <div className="page-shell task-detail-page">
        <Link className="office-back" to="/tasks">
          Back to Task Ledger
        </Link>
        <EmptyState title="Task not found" hint="It may have completed and been pruned from the runtime snapshot." />
      </div>
    );
  }

  const { task, agent, session, events, links, execution, deliveryRecovery } = detail;

  return (
    <div className="page-shell task-detail-page">
      <Link className="office-back" to="/tasks">
        Back to Task Ledger
      </Link>

      <header className={`task-detail-hero is-${task.status}`}>
        <div>
          <Badge tone={taskTone(task.status)} pulse={task.status === "running"}>
            {task.status}
          </Badge>
          <h1 className="page-title">{task.title ?? task.id}</h1>
          <p className="task-detail-subtitle mono">{task.id}</p>
        </div>
        {task.error ? <p className="task-detail-error">{task.error}</p> : null}
      </header>

      <section className="detail-pill-row">
        <div className="detail-pill">
          <span>Agent</span>
          <strong className="detail-pill-value">
            {agent && links.agent ? <Link to={links.agent}>{agent.name ?? agent.id}</Link> : task.agentId ?? "-"}
          </strong>
        </div>
        <div className="detail-pill">
          <span>Session</span>
          <strong className="detail-pill-value mono">
            {session && links.session ? <Link to={links.session}>{session.label ?? session.key}</Link> : task.sessionKey ?? "-"}
          </strong>
        </div>
        <div className="detail-pill">
          <span>Run</span>
          <strong className="detail-pill-value mono">{task.runId ?? session?.currentRunId ?? "-"}</strong>
        </div>
        <div className="detail-pill">
          <span>Kind</span>
          <strong className="detail-pill-value">{task.kind ?? "-"}</strong>
        </div>
        <div className="detail-pill">
          <span>Started</span>
          <strong className="detail-pill-value">{formatClock(task.startedAt)}</strong>
        </div>
        <div className="detail-pill">
          <span>Ended</span>
          <strong className="detail-pill-value">{formatClock(task.endedAt)}</strong>
        </div>
      </section>

      <div className="task-detail-grid">
        <Panel>
          <PanelHeader title="Progress, Result & Failure" />
          <div className="task-evidence-grid">
            <TaskNarrativeCard evidence={execution.progress} />
            <TaskNarrativeCard evidence={execution.result} />
            <TaskNarrativeCard evidence={execution.failure} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Lifecycle & Runtime" />
          <dl className="task-context-list">
            <ContextRow label="Created" value={formatClock(task.createdAt)} />
            <ContextRow label="Updated" value={formatClock(task.updatedAt)} />
            <ContextRow label="Started" value={formatClock(task.startedAt ?? task.runtime?.startedAt)} />
            <ContextRow label="Ended" value={formatClock(task.endedAt ?? task.runtime?.endedAt)} />
            <ContextRow label="Runtime" value={formatDuration(execution.runtimeMs)} />
            <ContextRow label="Runtime id" value={task.runtime?.id ?? "unavailable"} mono />
            <ContextRow label="Runtime source" value={execution.runtimeSource ?? "unavailable"} mono />
          </dl>
        </Panel>

        <Panel>
          <PanelHeader title="Result Delivery / Recovery" aside={<Badge tone={deliveryTone(deliveryRecovery)}>{deliveryRecovery.label}</Badge>} />
          <div className="delivery-recovery-card task-detail-delivery-card">
            <p>{deliveryRecovery.summary}</p>
            <div className="delivery-recovery-links" aria-label="Delivery recovery evidence">
              {deliveryRecovery.evidence.map((evidence) =>
                evidence.href ? (
                  <Link key={`${evidence.label}:${evidence.href}`} to={evidence.href}>{evidence.label}</Link>
                ) : (
                  <span key={`${evidence.label}:${evidence.detail ?? "detail"}`}>{evidence.label}: {evidence.detail}</span>
                ),
              )}
            </div>
            <div className="operator-action-chips" aria-label="Disabled recovery actions">
              {deliveryRecovery.disabledActions.map((action) => (
                <span key={action.label} className="operator-action-chip operator-action-chip-disabled" title={action.disabledReason}>
                  {action.label}
                </span>
              ))}
            </div>
            <p className="stat-label">
              Recovery is read-only: Dashclaw does not expose safe result-body, resend, or parent-injection metadata here.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Related Events" aside={<Link to="/timeline">Timeline</Link>} />
          {events.length === 0 ? (
            <EmptyState title="No related events" hint="No timeline entries currently match this task." />
          ) : (
            <div className="task-event-list">
              {events.map((event) => (
                <article key={event.id} className="task-event-row">
                  <div className="task-event-meta">
                    <span className="mono">{formatClock(event.timestamp)}</span>
                    <Badge tone={eventTone(event.kind)}>{event.kind}</Badge>
                  </div>
                  <div>
                    <strong>{event.title}</strong>
                    {event.summary ? <p className="ops-item-summary">{event.summary}</p> : null}
                    <div className="ops-item-meta">
                      {event.agentId ? <Link to={`/agents/${encodeURIComponent(event.agentId)}`}>agent:{event.agentId}</Link> : null}
                      {event.agentId && event.sessionKey ? (
                        <Link to={`/agents/${encodeURIComponent(event.agentId)}/sessions/${encodeURIComponent(event.sessionKey)}`}>
                          session
                        </Link>
                      ) : null}
                      {event.runId ? <span className="mono">run:{event.runId}</span> : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Identifiers & Lineage" />
          <dl className="task-context-list">
            <ContextRow label="Status" value={task.status} />
            <ContextRow label="Agent id" value={task.agentId ?? "unavailable"} mono href={links.agent} />
            <ContextRow label="Session key" value={task.sessionKey ?? "unavailable"} mono href={links.session} />
            <ContextRow label="Run id" value={task.runId ?? "unavailable"} mono />
            <ContextRow label="Owner key" mono valueNode={<TaskSessionReference sessionKey={task.ownerKey} sessions={snapshot.sessions} fallbackAgentId={task.agentId} />} />
            <ContextRow label="Child session" mono valueNode={<TaskSessionReference sessionKey={task.childSessionKey} sessions={snapshot.sessions} fallbackAgentId={task.agentId} />} />
            <ContextRow label="Source id" value={task.sourceId ?? "unavailable"} mono />
            <ContextRow label="Flow id" value={task.flowId ?? "unavailable"} mono />
            <ContextRow label="Error code" value={task.errorCode ?? "unavailable"} mono />
            <ContextRow label="Error kind" value={task.errorKind ?? "unavailable"} mono />
          </dl>
        </Panel>
      </div>
    </div>
  );
}

function TaskNarrativeCard({ evidence }: { evidence: TaskNarrativeEvidence }) {
  const tone = evidence.availability === "available" ? "ok" : "neutral";
  const fallback = evidence.availability === "unavailable"
    ? "OpenClaw did not supply this field."
    : "Not applicable for the current task state.";
  return (
    <article className={`task-evidence-card task-evidence-${evidence.availability}`}>
      <div className="task-evidence-head">
        <strong>{evidence.label}</strong>
        <Badge tone={tone}>{evidence.availability}</Badge>
      </div>
      <p>{evidence.summary ?? fallback}</p>
    </article>
  );
}

function ContextRow({
  label,
  value,
  valueNode,
  mono = false,
  href,
}: {
  label: string;
  value?: string;
  valueNode?: ReactNode;
  mono?: boolean;
  href?: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{valueNode ?? (href && value ? <Link to={href}>{value}</Link> : value)}</dd>
    </div>
  );
}

function TaskSessionReference({
  sessionKey,
  sessions,
  fallbackAgentId,
}: {
  sessionKey?: string;
  sessions: SessionSummary[];
  fallbackAgentId?: string;
}) {
  if (!sessionKey) return <>unavailable</>;
  const session = sessions.find((candidate) => candidate.key === sessionKey);
  const parsedAgentId = /^agent:([^:]+):/.exec(sessionKey)?.[1];
  const agentId = session?.agentId ?? parsedAgentId ?? fallbackAgentId;
  return agentId ? (
    <Link to={`/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionKey)}`}>{sessionKey}</Link>
  ) : (
    <>{sessionKey}</>
  );
}

function deliveryTone(delivery: DeliveryRecoveryState): "ok" | "warn" | "error" | "neutral" {
  return delivery.tone === "info" || delivery.tone === "neutral" ? "neutral" : delivery.tone;
}
