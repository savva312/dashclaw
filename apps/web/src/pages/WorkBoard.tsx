import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppState } from "../context";
import { buildDashboardModel, type AttentionTone, type WorkBoardColumn, type WorkItem } from "../runtime/dashboard";

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
    ...item.evidence.sessions.map((session) => `${session.label ?? ""} ${session.key} ${session.status ?? ""}`),
    ...item.evidence.tasks.map((task) => `${task.title ?? ""} ${task.id} ${task.runId ?? ""} ${task.status}`),
    ...item.evidence.approvals.map((approval) => `${approval.id} ${approval.command ?? ""} ${approval.status}`),
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

export function WorkBoardPage() {
  const { snapshot, timeline, loading, error, refresh } = useAppState();
  const [query, setQuery] = useState("");

  const model = useMemo(() => (snapshot ? buildDashboardModel(snapshot, timeline) : null), [snapshot, timeline]);

  if (loading && !snapshot) return <p>Loading…</p>;
  if (error) return <p className="badge error">{error}</p>;
  if (!snapshot || !model) return <p>Loading…</p>;

  const columns = model.workBoard.columns.map((column) => ({
    ...column,
    items: column.items.filter((item) => matchesQuery(item, query)),
  }));
  const totalItems = columns.reduce((sum, column) => sum + column.items.length, 0);
  const allEmpty = model.workBoard.items.length === 0;

  return (
    <div className="work-board-page">
      <div className="work-board-header">
        <div>
          <h1 className="page-title">Work Board</h1>
          <p className="work-board-subtitle">
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

function WorkBoardCard({ item }: { item: WorkItem }) {
  const primaryLink = item.links.task ?? item.links.session ?? item.links.agent ?? item.links.approval ?? item.links.timeline;
  const incomplete = item.lineage.quality !== "complete";

  return (
    <article className={`work-board-card work-board-card-${badgeClassForTone(item.tone)}`}>
      <div className="work-board-card-title-row">
        <strong>{primaryLink ? <Link to={primaryLink}>{item.title}</Link> : item.title}</strong>
        <span className={`badge ${badgeClassForTone(item.tone)}`}>{item.state}</span>
      </div>
      {item.summary ? <p className="work-board-card-summary">{item.summary}</p> : null}
      <dl className="work-board-evidence">
        <div>
          <dt>Agent</dt>
          <dd>{item.links.agent ? <Link to={item.links.agent}>{item.agentLabel ?? "agent"}</Link> : item.agentLabel ?? "—"}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd className="mono">{item.links.session ? <Link to={item.links.session}>{item.sessionLabel ?? "session"}</Link> : item.sessionLabel ?? "—"}</dd>
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
      {item.currentAction ? <div className="work-board-next">Current: {item.currentAction}</div> : null}
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
