import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppState } from "../context";
import { buildDashboardModel, taskLedgerCue, type AttentionTone, type DeliveryRecoveryState, type ReviewItem, type WorkBoardColumn, type WorkItem } from "../runtime/dashboard";
import { humanizeDiscordLabel } from "../lib/format";
import { sessionOperationalBadges } from "./agents/SessionOperational";

function badgeClassForTone(tone: AttentionTone | "ok") {
  if (tone === "ok") return "ok";
  if (tone === "error") return "error";
  if (tone === "warn") return "warn";
  return "neutral";
}

function stateDescription(id: WorkBoardColumn["id"]): string {
  switch (id) {
    case "inbox":
      return "New or queued work without active execution yet.";
    case "active":
      return "Running tasks and live sessions.";
    case "waiting":
      return "Approvals and operator decisions.";
    case "review":
      return "Paused or human-review work.";
    case "done":
      return "Recently completed work to verify or archive.";
    case "failed":
      return "Failed, timed-out, or recoverable work.";
  }
}

function emptyText(id: WorkBoardColumn["id"]): string {
  switch (id) {
    case "inbox":
      return "No new queued work.";
    case "active":
      return "No active work reported.";
    case "waiting":
      return "Nothing is waiting on a human.";
    case "review":
      return "No review items right now.";
    case "done":
      return "No completed work yet.";
    case "failed":
      return "No failed recoverable work.";
  }
}

function matchesQuery(item: WorkItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    item.title,
    item.summary,
    item.state,
    item.agentLabel,
    item.sessionLabel,
    item.currentAction,
    item.lineage.quality,
    item.lineage.diagnostic,
    ...item.evidence.agents.map((agent) => `${agent.name ?? ""} ${agent.id}`),
    ...item.evidence.sessions.map((session) => [
      session.label,
      session.key,
      session.status,
      session.model,
      session.modelProvider,
      session.agentRuntime,
      session.agentRuntimeSource,
      session.parentSessionKey,
      session.spawnedBy,
      session.ownerSessionKey,
      session.subagentRole,
      session.subagentControlScope,
      session.subagentRunState,
      session.deliveryContext?.channel,
      session.deliveryContext?.to,
      session.origin?.provider,
      session.origin?.surface,
    ].filter(Boolean).join(" ")),
    ...item.evidence.tasks.map((task) => `${task.title ?? ""} ${task.id} ${task.runId ?? ""} ${task.status} ${task.progressSummary ?? ""} ${task.terminalSummary ?? ""} ${task.ownerKey ?? ""} ${task.childSessionKey ?? ""} ${task.sourceId ?? ""} ${task.flowId ?? ""}`),
    ...item.evidence.approvals.map((approval) => `${approval.id} ${approval.command ?? ""} ${approval.status}`),
    item.deliveryRecovery.label,
    item.deliveryRecovery.status,
    item.deliveryRecovery.summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalized);
}

function primaryEvidence(item: WorkItem): string {
  const parts = [
    `${item.evidence.sessions.length} session${item.evidence.sessions.length === 1 ? "" : "s"}`,
    `${item.evidence.tasks.length} task${item.evidence.tasks.length === 1 ? "" : "s"}`,
  ];
  if (item.evidence.approvals.length > 0) parts.push(`${item.evidence.approvals.length} approval${item.evidence.approvals.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

const REVIEW_LAST_SEEN_KEY = "dashclaw.workReview.lastSeenAt";

function readLocalLastSeen(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(REVIEW_LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

export function WorkBoardPage() {
  const { snapshot, timeline, loading, error, refresh } = useAppState();
  const [query, setQuery] = useState("");
  const [reviewLastSeenAt, setReviewLastSeenAt] = useState<string | null>(() => readLocalLastSeen());

  const model = useMemo(
    () => (snapshot ? buildDashboardModel(snapshot, timeline, { reviewLastSeenAt: reviewLastSeenAt ?? undefined }) : null),
    [snapshot, timeline, reviewLastSeenAt],
  );

  useEffect(() => {
    setReviewLastSeenAt(readLocalLastSeen());
  }, []);

  if (loading && !snapshot) return <p>Loading…</p>;
  if (error) return <p className="badge error">{error}</p>;
  if (!snapshot || !model) return <p>Loading…</p>;

  const columns = model.workBoard.columns.map((column) => ({
    ...column,
    items: column.items.filter((item) => matchesQuery(item, query)),
  }));
  const totalItems = columns.reduce((sum, column) => sum + column.items.length, 0);
  const allEmpty = model.workBoard.items.length === 0;
  const reviewItems = model.reviewQueue.items;
  const changedReviewItems = model.reviewQueue.changedSinceLastSeen;
  const visibleReviewItems = (changedReviewItems.length > 0 ? changedReviewItems : reviewItems).slice(0, 6);
  const markReviewSeen = () => {
    const nextSeenAt = model.generatedAt;
    try {
      window.localStorage.setItem(REVIEW_LAST_SEEN_KEY, nextSeenAt);
    } catch {
      // Keep the in-memory marker for this tab even if localStorage is unavailable.
    }
    setReviewLastSeenAt(nextSeenAt);
  };
  const resetReviewSeen = () => {
    try {
      window.localStorage.removeItem(REVIEW_LAST_SEEN_KEY);
    } catch {
      // Nothing to reset persistently if localStorage is unavailable.
    }
    setReviewLastSeenAt(null);
  };

  return (
    <div className="page-shell work-board-page">
      <div className="page-header work-board-header">
        <div>
          <h1 className="page-title">Work Board</h1>
          <p className="page-subtitle">
            Read-only board for durable work items across threads, sessions, tasks, approvals, and partial-lineage evidence.
          </p>
        </div>
        <div className="work-board-actions">
          <Link className="btn" to="/graph">Open graph</Link>
          <button className="btn" type="button" onClick={() => void refresh()}>Refresh</button>
        </div>
      </div>

      <div className="grid grid-4 work-board-stats">
        <BoardStat label="active" value={model.workBoard.summary.active} tone="ok" />
        <BoardStat label="waiting" value={model.workBoard.summary.waiting} tone="warn" />
        <BoardStat label="review" value={model.workBoard.summary.review} tone="neutral" />
        <BoardStat label="failed" value={model.workBoard.summary.failed} tone={model.workBoard.summary.failed ? "error" : "neutral"} />
      </div>

      <div className="card work-board-toolbar">
        <label className="work-board-search">
          <span>Find work</span>
          <input
            type="search"
            value={query}
            placeholder="title, agent, session, task, run, lineage…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <span className="stat-label">
          Showing {totalItems} work items · {model.workBoard.items.length} total · updated {new Date(snapshot.updatedAt).toLocaleTimeString()}
        </span>
      </div>

      <section className="card work-board-review" aria-label="Recently changed review queue">
        <div className="work-board-review-head">
          <div>
            <h3>Review queue</h3>
            <p className="stat-label">
              Completed, failed, and human-review work changed since your local last-seen marker.
              {reviewLastSeenAt ? ` Last marked seen ${new Date(reviewLastSeenAt).toLocaleString()}.` : " Nothing has been marked seen on this browser yet."}
            </p>
          </div>
          <div className="work-board-actions">
            <span className={`badge ${changedReviewItems.length > 0 ? "warn" : "neutral"}`}>{changedReviewItems.length} new/changed</span>
            <button className="btn" type="button" onClick={markReviewSeen} disabled={reviewItems.length === 0}>Mark seen locally</button>
            {reviewLastSeenAt ? <button className="btn" type="button" onClick={resetReviewSeen}>Reset</button> : null}
          </div>
        </div>
        {visibleReviewItems.length === 0 ? (
          <p className="empty">No completed, failed, or review work to inspect yet.</p>
        ) : (
          <div className="work-board-review-list">
            {visibleReviewItems.map((item) => (
              <ReviewQueueCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {allEmpty ? (
        <div className="card work-board-empty">
          <h3>No work items</h3>
          <p className="empty">Gateway is connected, but no sessions, tasks, approvals, or meaningful events are available to group.</p>
        </div>
      ) : null}

      <div className="work-board-lanes" aria-label="Work board lanes">
        {columns.map((column) => (
          <section key={column.id} className="card work-board-lane">
            <div className="work-board-lane-head">
              <div>
                <h3>{column.label}</h3>
                <p className="stat-label">{stateDescription(column.id)}</p>
              </div>
              <span className="badge neutral">{column.items.length}</span>
            </div>
            {column.items.length === 0 ? (
              <p className="empty">{emptyText(column.id)}</p>
            ) : (
              <div className="work-board-card-list">
                {column.items.map((item) => (
                  <WorkBoardCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function BoardStat({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "error" | "neutral" }) {
  return (
    <div className="card">
      <h3>{label}</h3>
      <div className={`stat-value work-board-stat-${tone}`}>{value}</div>
    </div>
  );
}

function ReviewQueueCard({ item }: { item: ReviewItem }) {
  return (
    <div className="work-board-review-item">
      <WorkBoardCard item={item.workItem} compact />
      <div className="work-board-review-meta">
        <span className={`badge ${badgeClassForTone(item.tone)}`}>{item.kind}</span>
        {item.sinceLastSeen ? <span className="badge warn">since last seen</span> : null}
        <span className={`badge ${badgeClassForTone(item.deliveryRecovery.tone === "neutral" ? "info" : item.deliveryRecovery.tone)}`}>{item.deliveryRecovery.label}</span>
      </div>
      <div className="work-board-next">Next: {item.nextAction}</div>
    </div>
  );
}

function WorkBoardCard({ item, compact = false }: { item: WorkItem; compact?: boolean }) {
  const primaryLink = item.links.task ?? item.links.session ?? item.links.agent ?? item.links.approval ?? item.links.timeline;
  const incomplete = item.lineage.quality !== "complete";
  const taskCue = item.evidence.tasks[0] ? taskLedgerCue(item.evidence.tasks[0]) : undefined;
  const operationalSignals = item.evidence.sessions
    .flatMap(sessionOperationalBadges)
    .filter((signal, index, all) => all.findIndex((candidate) => candidate.label === signal.label) === index)
    .slice(0, 3);
  const sessionKey = item.evidence.sessions[0]?.key;
  const titleDisplay = humanizeDiscordLabel(item.title, sessionKey);
  const sessionDisplay = item.sessionLabel
    ? humanizeDiscordLabel(item.sessionLabel, sessionKey)
    : undefined;

  return (
    <article className={`work-board-card work-board-card-${badgeClassForTone(item.tone)}${compact ? " work-board-card-compact" : ""}`}>
      <div className="work-board-card-title-row">
        <div className="work-board-card-title-block">
          <strong className="text-clamp-2">
            {primaryLink ? (
              <Link to={primaryLink} title={[item.title, sessionKey].filter(Boolean).join(" · ")}>
                {titleDisplay.title}
              </Link>
            ) : (
              titleDisplay.title
            )}
          </strong>
          {titleDisplay.detail ? <div className="identity-detail mono text-clip" title={titleDisplay.detail}>{titleDisplay.detail}</div> : null}
        </div>
        <span className={`badge ${badgeClassForTone(item.tone)}`}>{item.state}</span>
      </div>
      {taskCue ? (
        <div className="work-board-task-cue">
          <span className={`badge ${taskCue.availability === "available" ? "ok" : "neutral"}`}>{taskCue.label}</span>
          {taskCue.summary ? <span className="text-clamp-2">{taskCue.summary}</span> : null}
        </div>
      ) : null}
      {item.summary ? <p className="work-board-card-summary text-clamp-2">{item.summary}</p> : null}
      <dl className="work-board-evidence">
        <div>
          <dt>Agent</dt>
          <dd>{item.links.agent ? <Link to={item.links.agent}>{item.agentLabel ?? "agent"}</Link> : item.agentLabel ?? "—"}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>
            {sessionDisplay ? (
              <>
                {item.links.session ? <Link to={item.links.session}>{sessionDisplay.title}</Link> : sessionDisplay.title}
                {sessionDisplay.detail ? <div className="identity-detail mono text-clip">{sessionDisplay.detail}</div> : null}
              </>
            ) : "—"}
          </dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>{primaryEvidence(item)}</dd>
        </div>
        <div>
          <dt>Age / updated</dt>
          <dd>{item.ageLabel}{item.updatedAt ? ` · ${new Date(item.updatedAt).toLocaleTimeString()}` : ""}</dd>
        </div>
      </dl>
      <DeliveryRecoveryCard delivery={item.deliveryRecovery} />
      {operationalSignals.length > 0 ? (
        <div className="session-operational-badges" aria-label="Session operational signals">
          {operationalSignals.map((signal) => (
            <span key={signal.label} className={`badge ${signal.tone}`}>{signal.label}</span>
          ))}
        </div>
      ) : null}
      {item.currentAction ? <div className="work-board-next text-clip">Current: {item.currentAction}</div> : null}
      {incomplete ? <div className="badge warn">{item.lineage.diagnostic ?? "lineage incomplete"}</div> : null}
      <div className="work-board-links">
        {item.links.task ? <Link to={item.links.task}>Task</Link> : null}
        {item.links.session ? <Link to={item.links.session}>Session</Link> : null}
        {item.links.agent ? <Link to={item.links.agent}>Agent</Link> : null}
        {item.links.approval ? <Link to={item.links.approval}>Approval</Link> : null}
        <Link to="/graph">Graph</Link>
      </div>
    </article>
  );
}

function DeliveryRecoveryCard({ delivery }: { delivery: DeliveryRecoveryState }) {
  if (delivery.status === "unknown") return null;
  return (
    <div className={`delivery-recovery-card delivery-recovery-${delivery.status}`}>
      <div className="delivery-recovery-head">
        <span className={`badge ${badgeClassForTone(delivery.tone === "neutral" ? "info" : delivery.tone)}`}>{delivery.label}</span>
        <span className="stat-label">result delivery/recovery</span>
      </div>
      <p>{delivery.summary}</p>
      {delivery.evidence.length ? (
        <div className="delivery-recovery-links" aria-label="Delivery recovery evidence">
          {delivery.evidence.map((evidence) =>
            evidence.href ? (
              <Link key={`${evidence.label}:${evidence.href}`} to={evidence.href}>{evidence.label}</Link>
            ) : (
              <span key={`${evidence.label}:${evidence.detail ?? "detail"}`}>{evidence.label}: {evidence.detail}</span>
            ),
          )}
        </div>
      ) : null}
      {delivery.status !== "delivered" ? (
        <div className="operator-action-chips" aria-label="Disabled recovery actions">
          {delivery.disabledActions.map((action) => (
            <span key={action.label} className="operator-action-chip operator-action-chip-disabled" title={action.disabledReason}>
              {action.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
