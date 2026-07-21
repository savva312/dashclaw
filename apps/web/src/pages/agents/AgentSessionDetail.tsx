import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAppState } from "../../context";
import { SessionPreviewPanel } from "./SessionPreviewPanel";
import { AgentAvatar } from "./AgentAvatar";
import { KindChip, StatusChip } from "./Chips";
import { ExecutionContext } from "./ExecutionContext";
import { SessionOperationalBadges, SessionOperationalDetails } from "./SessionOperational";
import {
  eventKindShort,
  eventKindTone,
  formatClock,
  parseSessionKind,
  sessionDisplayName,
  sessionStatusLabel,
  sessionStatusTone,
} from "./utils";
import { Breadcrumb, Button, EmptyState, Panel, SegmentedControl } from "../../ui";

type DetailTab = "conversation" | "events";

export function AgentSessionDetail() {
  const { agentId = "", sessionKey = "" } = useParams();
  const { snapshot, timeline } = useAppState();
  const [tab, setTab] = useState<DetailTab>("conversation");
  const [copied, setCopied] = useState(false);

  const agent = snapshot?.agents.find((a) => a.id === agentId);
  const session = snapshot?.sessions.find((s) => s.key === sessionKey);
  const relatedTasks = useMemo(
    () =>
      snapshot?.tasks.filter((task) => task.sessionKey === sessionKey).sort((a, b) => {
        const aTime = Date.parse(a.startedAt ?? a.endedAt ?? "");
        const bTime = Date.parse(b.startedAt ?? b.endedAt ?? "");
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
      }) ?? [],
    [snapshot?.tasks, sessionKey],
  );
  const relatedTask = relatedTasks.find((task) => task.status === "running" || task.status === "queued") ?? relatedTasks[0];

  const sessionEvents = useMemo(
    () =>
      timeline
        .filter(
          (event) =>
            event.sessionKey === sessionKey &&
            event.kind !== "health" &&
            event.kind !== "presence" &&
            event.kind !== "heartbeat" &&
            event.kind !== "agent.assistant" &&
            event.kind !== "chat",
        )
        .slice(-40)
        .reverse(),
    [timeline, sessionKey],
  );

  const assistantEvents = useMemo(
    () =>
      timeline.filter(
        (event) =>
          event.sessionKey === sessionKey &&
          (event.kind === "agent.assistant" || event.kind === "chat") &&
          Boolean(event.summary),
      ).slice(-1),
    [timeline, sessionKey],
  );

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(sessionKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (!snapshot) return <p className="office-loading">Loading…</p>;
  if (!agent || !session) {
    return (
      <div className="page-shell office-page">
        <Link className="office-back" to={agentId ? `/agents/${encodeURIComponent(agentId)}` : "/agents"}>
          ← Back
        </Link>
        <EmptyState title="Session not found" hint="It may have been pruned from the gateway." />
      </div>
    );
  }

  const kind = parseSessionKind(session.key);

  return (
    <div className="page-shell office-page">
      <Link className="office-back" to={`/agents/${encodeURIComponent(agentId)}`}>
        ← {agent.name ?? agent.id}
      </Link>
      <Breadcrumb
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
          <div className="session-key-row">
            <code className="session-key mono">{session.key}</code>
            <Button className="session-copy-btn" onClick={() => void copyKey()}>
              {copied ? "Copied" : "Copy key"}
            </Button>
          </div>
        </div>
        <StatusChip label={sessionStatusLabel(session)} tone={sessionStatusTone(session)} pulse={session.isActive} />
      </header>

      <SessionOperationalBadges session={session} />

      <ExecutionContext session={session} variant="full" />

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
        {relatedTask ? (
          <div className="detail-pill detail-pill-task">
            <span>Task</span>
            <strong className="detail-pill-value">
              <Link to={`/tasks/${encodeURIComponent(relatedTask.id)}`}>{relatedTask.title ?? relatedTask.id}</Link>
            </strong>
          </div>
        ) : null}
      </div>

      <SessionOperationalDetails session={session} sessions={snapshot?.sessions ?? []} />

      <div className="detail-tabs">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: "conversation", label: "Conversation" },
            { value: "events", label: `Live stream (${sessionEvents.length})` },
          ]}
        />
      </div>

      <div className={`session-detail-layout ${tab === "events" ? "show-events" : "show-conversation"}`}>
        <Panel className="session-detail-panel session-detail-convo" live={session.isActive}>
          <h3>Conversation</h3>
          <SessionPreviewPanel
            sessionKey={session.key}
            isActive={session.isActive}
            assistantEvents={assistantEvents}
          />
        </Panel>

        <Panel className="session-detail-panel">
          <h3>Live stream</h3>
          {sessionEvents.length === 0 ? (
            <EmptyState title="No events yet" hint="Activity from this session will show up here in real time." />
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
                      <span className={`event-kind tone-${eventKindTone(event.kind)}`}>
                        {eventKindShort(event.kind)}
                      </span>
                    </div>
                    <strong>{event.title}</strong>
                    {event.summary ? <p className="office-muted">{event.summary}</p> : null}
                    {(event.taskId || event.agentId || event.runId) ? (
                      <div className="ops-item-meta">
                        {event.agentId ? <Link to={`/agents/${encodeURIComponent(event.agentId)}`}>agent:{event.agentId}</Link> : null}
                        {event.taskId ? <Link to={`/tasks/${encodeURIComponent(event.taskId)}`}>task:{event.taskId}</Link> : null}
                        {event.runId ? <span className="mono">run:{event.runId}</span> : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
