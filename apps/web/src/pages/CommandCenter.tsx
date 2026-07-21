import { Link } from "react-router-dom";
import { useAppState } from "../context";
import {
  buildDashboardModel,
  type ApprovalCockpitItem,
  type AttentionTone,
  type ControlCenterItem,
  type ControlCenterLane,
} from "../runtime/dashboard";

function formatUptime(ms?: number): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatAge(iso?: string): string {
  if (!iso) return "never";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

export function CommandCenterPage() {
  const { snapshot, timeline, loading, error, refresh, liveConnected } = useAppState();

  if (loading && !snapshot) return <p>Loading…</p>;
  if (error) return <p className="badge error">{error}</p>;
  if (!snapshot) return <p>Loading…</p>;

  const s = snapshot!;
  const model = buildDashboardModel(s, timeline);
  const lastMeaningfulEvent = [...model.recentEvents].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  )[0];

  return (
    <div className="page-shell command-center-page">
      <div className="page-header">
        <h1 className="page-title">Command Center</h1>
        <div className="page-header-actions">
          <Link className="btn" to="/graph">Work graph</Link>
          <Link className="btn" to="/work">Work board</Link>
          <button className="btn" type="button" onClick={() => void refresh()}>Refresh</button>
        </div>
      </div>

      <RuntimeStateCard model={model} liveConnected={liveConnected} />

      <ControlCenterOverviewCard model={model.controlCenter} />

      {model.approvalCockpit.summary.pending > 0 || model.approvalCockpit.summary["sync-issue"] > 0 || model.approvalCockpit.summary.expired > 0 ? (
        <ApprovalCockpitCard model={model.approvalCockpit} />
      ) : null}

      <div className="grid grid-4 command-center-stats">
        <div className="card stat-card">
          <h3>Gateway</h3>
          <div className="stat-value">
            <span className={`badge ${s.connectionState === "connected" ? "ok" : "error"}`}>
              {s.connectionState}
            </span>
          </div>
          <div className="stat-label">v{s.health?.version ?? "—"} · uptime {formatUptime(s.health?.uptimeMs)}</div>
          <div className="stat-label">
            Snapshot {formatAge(s.updatedAt)} · event {formatAge(lastMeaningfulEvent?.timestamp)}
            {model.isStale ? " · stale" : model.isLive ? " · live" : " · verify"}
          </div>
        </div>
        <div className="card stat-card">
          <h3>Active Runs</h3>
          <div className="stat-value">{s.activeRunCount}</div>
          <div className="stat-label">
            {s.tasks.filter((t) => t.status === "running").length} tasks running · {s.agents.length} agents
          </div>
        </div>
        <div className="card stat-card">
          <h3>Pending Approvals</h3>
          <div className="stat-value">{s.pendingApprovalCount}</div>
          <div className="stat-label">exec / plugin queue</div>
        </div>
        <div className="card stat-card">
          <h3>Failed Tasks</h3>
          <div className="stat-value">{s.failedTaskCount}</div>
          <div className="stat-label">failed or timed out</div>
        </div>
      </div>

      <div className="card command-center-activity">
        <div className="command-center-activity-head">
          <h3>Recent activity</h3>
          <Link className="stat-label" to="/tasks">Open task ledger</Link>
        </div>
        {s.tasks.length === 0 ? (
          <p className="empty">No tasks in ledger</p>
        ) : (
          <table className="table command-center-activity-table">
            <thead>
              <tr><th>Title</th><th>Status</th><th>Agent</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {s.tasks.slice(0, 6).map((t) => (
                <tr key={t.id}>
                  <td className="cell-clip">
                    <Link className="text-clip" to={`/tasks/${encodeURIComponent(t.id)}`} title={t.title ?? t.id}>
                      {formatItemTitle(t.title ?? t.id)}
                    </Link>
                  </td>
                  <td><span className={`badge ${t.status === "running" ? "ok" : t.status === "failed" ? "error" : "neutral"}`}>{t.status}</span></td>
                  <td className="text-clip">{t.agentId ?? "—"}</td>
                  <td className="stat-label">{t.endedAt ? formatAge(t.endedAt) : t.startedAt ? formatAge(t.startedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ApprovalCockpitCard({ model }: { model: ReturnType<typeof buildDashboardModel>["approvalCockpit"] }) {
  const visible = model.items.slice(0, 3);
  return (
    <div className="card approval-cockpit">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
        <div>
          <h3>Exec Approval Cockpit</h3>
          <p className="stat-label" style={{ marginTop: "0.35rem" }}>
            Read-only queue/history for command approvals, sync confusion, and missing policy metadata. <Link to="/approvals">Open full cockpit</Link>
          </p>
        </div>
        <div className="approval-cockpit-summary" aria-label="Approval cockpit summary">
          <span className="badge warn">{model.summary.pending} pending</span>
          <span className="badge error">{model.summary["sync-issue"] + model.summary.expired} confused/expired</span>
          <span className="badge neutral">{model.summary.resolved} resolved</span>
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="empty">No approvals or approval timeline evidence reported.</p>
      ) : (
        <div className="approval-cockpit-list">
          {visible.map((item) => <ApprovalCockpitMiniCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}

function ApprovalCockpitMiniCard({ item }: { item: ApprovalCockpitItem }) {
  return (
    <article className={`approval-cockpit-item approval-cockpit-item-${badgeClassForTone(item.tone)}`}>
      <div className="approval-cockpit-head">
        <div>
          <strong>{item.kind === "exec" ? "Exec approval" : item.kind === "plugin" ? "Plugin approval" : "Approval evidence"}</strong>
          <div className="stat-label mono text-clip">{item.id}</div>
        </div>
        <span className={`badge ${badgeClassForTone(item.tone)}`}>{item.statusLabel}</span>
      </div>
      <pre className="approval-command">{item.command}</pre>
      <p className="approval-risk text-clamp-2">{item.riskSummary}</p>
      <div className="operator-action-chips" aria-label="Approval evidence links and disabled decisions">
        {item.evidence.slice(0, 4).map((evidence) => evidence.href ? <Link key={`${evidence.label}:${evidence.href}`} className="operator-action-chip" to={evidence.href}>{evidence.label}</Link> : null)}
        {item.disabledActions.slice(0, 2).map((action) => (
          <span key={action.label} className="operator-action-chip operator-action-chip-disabled" title={`${action.label} unavailable: ${action.disabledReason}`}>
            {action.label}
          </span>
        ))}
      </div>
    </article>
  );
}

import { humanSessionTitle } from "../lib/format";

function formatItemTitle(title: string): string {
  return humanSessionTitle(title, undefined);
}

function ControlCenterOverviewCard({
  model,
}: {
  model: ReturnType<typeof buildDashboardModel>["controlCenter"];
}) {
  const lanes: Array<{ key: ControlCenterLane; title: string; empty: string }> = [
    { key: "activeNow", title: "Active Now", empty: "No active work reported." },
    { key: "waitingOnMe", title: "Waiting On Me", empty: "No pending approvals." },
    { key: "attention", title: "Needs Attention", empty: "No stale, lost, access, or security warnings." },
    { key: "failedRecoverable", title: "Failed / Recoverable", empty: "No failed or timed-out tasks." },
    { key: "recentlyCompleted", title: "Recently Completed", empty: "No completed tasks yet." },
  ];

  const visibleLanes = lanes.filter((lane) => model[lane.key].length > 0);

  return (
    <div className="card control-center-card">
      <div className="control-center-card-head">
        <div>
          <h3>Operator queue</h3>
          <p className="stat-label control-center-card-copy">
            What needs you next — open an item to drill into task, session, or agent detail.
          </p>
        </div>
        <span className={`badge ${model.summary.operatorQueue > 0 ? "warn" : "ok"}`}>
          {model.summary.operatorQueue} need operator
        </span>
      </div>
      <div className="control-center-summary" aria-label="Control Center summary">
        <ControlCenterSummaryStat label="active" value={model.summary.activeNow} tone={model.summary.activeNow > 0 ? "ok" : "neutral"} />
        <ControlCenterSummaryStat label="waiting" value={model.summary.waitingOnMe} tone={model.summary.waitingOnMe > 0 ? "warn" : "neutral"} />
        <ControlCenterSummaryStat label="attention" value={model.summary.attention} tone={model.summary.attention > 0 ? "warn" : "neutral"} />
        <ControlCenterSummaryStat label="failed" value={model.summary.failedRecoverable} tone={model.summary.failedRecoverable > 0 ? "error" : "neutral"} />
        <ControlCenterSummaryStat label="completed" value={model.summary.recentlyCompleted} tone="neutral" />
      </div>
      {visibleLanes.length === 0 ? (
        <p className="empty" style={{ marginTop: "1rem" }}>Queue is clear — no active, waiting, attention, failed, or recently completed items.</p>
      ) : (
        <div className="control-center-lanes">
          {visibleLanes.map((lane) => (
            <ControlCenterLaneCard
              key={lane.key}
              title={lane.title}
              items={model[lane.key]}
              empty={lane.empty}
              limit={lane.key === "recentlyCompleted" ? 2 : 3}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ControlCenterSummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "error" | "neutral";
}) {
  return (
    <div className={`control-center-summary-stat control-center-summary-stat-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ControlCenterLaneCard({
  title,
  items,
  empty,
  limit = 3,
}: {
  title: string;
  items: ControlCenterItem[];
  empty: string;
  limit?: number;
}) {
  return (
    <section className="control-center-lane">
      <div className="control-center-lane-head">
        <h4>{title}</h4>
        <span className="badge neutral">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <div className="control-center-lane-list">
          {items.slice(0, limit).map((item) => (
            <ControlCenterWorkRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function ControlCenterWorkRow({ item }: { item: ControlCenterItem }) {
  const primaryLink = item.links.task ?? item.links.session ?? item.links.agent ?? item.links.approval ?? item.links.timeline;
  const lastUpdated = item.updatedAt ?? item.completedAt ?? item.startedAt;
  const title = formatItemTitle(item.title);

  return (
    <div className="control-center-item-row">
      <span className={`badge ${badgeClassForTone(item.tone)}`}>{item.status}</span>
      <div className="control-center-item-main">
        {primaryLink ? (
          <Link className="control-center-item-title" to={primaryLink} title={item.title}>{title}</Link>
        ) : (
          <span className="control-center-item-title">{title}</span>
        )}
        {item.summary ? <div className="control-center-item-summary text-clamp-2">{item.summary}</div> : null}
        <div className="control-center-item-meta text-clip">
          {item.agentLabel ?? "Unknown agent"}
          {item.sessionLabel ? ` · ${item.sessionLabel}` : ""}
          {lastUpdated ? ` · ${formatAge(lastUpdated)}` : ""}
        </div>
      </div>
    </div>
  );
}

function RuntimeStateCard({
  model,
  liveConnected,
}: {
  model: ReturnType<typeof buildDashboardModel>;
  liveConnected: boolean;
}) {
  const status = model.runtimeStatus;
  return (
    <div className={`runtime-state-card runtime-state-card-${status.tone}`}>
      <div>
        <div className="runtime-state-kicker">Runtime state</div>
        <strong>{status.label}</strong>
        <p>{status.summary}</p>
      </div>
      <div className="runtime-state-meta">
        <span className={`badge ${badgeClassForRuntimeTone(status.tone)}`}>
          {status.empty ? "empty" : status.tone}
        </span>
        <span className="stat-label">event stream {liveConnected ? "connected" : "polling"}</span>
      </div>
    </div>
  );
}

function badgeClassForRuntimeTone(tone: ReturnType<typeof buildDashboardModel>["runtimeStatus"]["tone"]): "ok" | "error" | "warn" | "neutral" {
  if (tone === "ok") return "ok";
  return badgeClassForTone(tone);
}

function badgeClassForTone(tone: AttentionTone | "ok"): "ok" | "error" | "warn" | "neutral" {
  if (tone === "error") return "error";
  if (tone === "warn") return "warn";
  if (tone === "ok") return "ok";
  return "neutral";
}
