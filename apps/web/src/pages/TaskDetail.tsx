import { Link, useParams } from "react-router-dom";
import { useMemo } from "react";
import { useAppState } from "../context";
import { buildTaskDetailModel } from "../runtime/dashboard";
import { Badge, EmptyState, Panel, PanelHeader } from "../ui";

function formatClock(iso?: string): string {
  if (!iso) return "-";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString();
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
      <div className="task-detail-page">
        <Link className="office-back" to="/tasks">
          Back to Task Ledger
        </Link>
        <EmptyState title="Task not found" hint="It may have completed and been pruned from the runtime snapshot." />
      </div>
    );
  }

  const { task, agent, session, events, links } = detail;

  return (
    <div className="task-detail-page">
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
          <PanelHeader title="Context" />
          <dl className="task-context-list">
            <div>
              <dt>Status</dt>
              <dd>{task.status}</dd>
            </div>
            <div>
              <dt>Agent id</dt>
              <dd className="mono">{task.agentId ?? "-"}</dd>
            </div>
            <div>
              <dt>Session key</dt>
              <dd className="mono">{task.sessionKey ?? "-"}</dd>
            </div>
            <div>
              <dt>Run id</dt>
              <dd className="mono">{task.runId ?? "-"}</dd>
            </div>
            <div>
              <dt>Error</dt>
              <dd>{task.error ?? "-"}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
