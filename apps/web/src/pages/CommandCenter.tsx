import { Link } from "react-router-dom";
import { useAppState } from "../context";
import {
  buildDashboardModel,
  type ApprovalCockpitItem,
  type AttentionTone,
  type ControlCenterItem,
  type ControlCenterLane,
  type OperatorAction,
  type WorkGraphModel,
  type WorkGraphNode,
  type WorkGraphStatus,
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
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title">Command Center</h1>
        <button className="btn" type="button" onClick={() => void refresh()}>Refresh</button>
      </div>

      <RuntimeStateCard model={model} liveConnected={liveConnected} />

      <ControlCenterOverviewCard model={model.controlCenter} />

      <InterventionCard model={model.interventionSummary} />

      <ApprovalCockpitCard model={model.approvalCockpit} />

      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
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
        <div className="card">
          <h3>Active Runs</h3>
          <div className="stat-value">{s.activeRunCount}</div>
          <div className="stat-label">
            {s.tasks.filter((t) => t.status === "running").length} tasks running · updated{" "}
            {new Date(s.updatedAt).toLocaleTimeString()}
          </div>
        </div>
        <div className="card">
          <h3>Pending Approvals</h3>
          <div className="stat-value">{s.pendingApprovalCount}</div>
          <div className="stat-label">exec / plugin queue</div>
        </div>
        <div className="card">
          <h3>Failed Tasks</h3>
          <div className="stat-value">{s.failedTaskCount}</div>
          <div className="stat-label">failed or timed out</div>
        </div>
      </div>

      <WorkGraphCard graph={model.workGraph} />

      <div className="grid grid-2">
        <div className="card">
          <h3>Agents ({s.agents.length})</h3>
          {s.agents.length === 0 ? (
            <p className="empty">No agents reported</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Agent</th><th>Model</th><th>Runtime</th></tr>
              </thead>
              <tbody>
                {s.agents.map((a) => (
                  <tr key={a.id}>
                    <td><Link to={`/agents/${encodeURIComponent(a.id)}`}>{a.name ?? a.id}</Link></td>
                    <td className="mono">{a.model ?? "—"}</td>
                    <td>{a.runtime ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>Recent Tasks</h3>
          {s.tasks.slice(0, 8).length === 0 ? (
            <p className="empty">No tasks in ledger</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Title</th><th>Status</th><th>Agent</th></tr>
              </thead>
              <tbody>
                {s.tasks.slice(0, 8).map((t) => (
                  <tr key={t.id}>
                    <td><Link to={`/tasks/${encodeURIComponent(t.id)}`}>{t.title ?? t.id}</Link></td>
                    <td><span className={`badge ${t.status === "running" ? "ok" : t.status === "failed" ? "error" : "neutral"}`}>{t.status}</span></td>
                    <td>{t.agentId ? <Link to={`/agents/${encodeURIComponent(t.agentId)}`}>{t.agentId}</Link> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function ApprovalCockpitCard({ model }: { model: ReturnType<typeof buildDashboardModel>["approvalCockpit"] }) {
  const visible = model.items.slice(0, 6);
  return (
    <div className="card approval-cockpit" style={{ marginBottom: "1.5rem" }}>
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
          <div className="stat-label mono">{item.id}</div>
        </div>
        <span className={`badge ${badgeClassForTone(item.tone)}`}>{item.statusLabel}</span>
      </div>
      <pre className="approval-command">{item.command}</pre>
      <dl className="approval-cockpit-details">
        <div><dt>cwd</dt><dd className="mono">{item.cwd ?? "not reported"}</dd></div>
        <div><dt>host</dt><dd className="mono">{item.host ?? "not reported"}</dd></div>
        <div><dt>origin</dt><dd className="mono">{[item.origin.agentId && `agent:${item.origin.agentId}`, item.origin.sessionKey && `session:${item.origin.sessionKey}`, item.origin.taskId && `task:${item.origin.taskId}`].filter(Boolean).join(" · ") || "not linked"}</dd></div>
        <div><dt>timeout/status</dt><dd>{item.timeout ?? "timeout not reported"}</dd></div>
      </dl>
      <p className="approval-risk">{item.riskSummary}</p>
      <div className="operator-action-chips" aria-label="Approval evidence links and disabled decisions">
        {item.evidence.map((evidence) => evidence.href ? <Link key={`${evidence.label}:${evidence.href}`} className="operator-action-chip" to={evidence.href}>{evidence.label}</Link> : null)}
        {item.disabledActions.map((action) => (
          <span key={action.label} className="operator-action-chip operator-action-chip-disabled" title={action.disabledReason}>
            {action.label} unavailable: {action.disabledReason}
          </span>
        ))}
      </div>
    </article>
  );
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

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline" }}>
        <div>
          <h3>Control Center</h3>
          <p className="stat-label" style={{ marginTop: "0.35rem" }}>
            Active work and operator action queue. <Link to="#work-graph">View lineage / graph</Link>
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
      <div className="grid grid-2" style={{ marginTop: "1rem" }}>
        {lanes.map((lane) => (
          <ControlCenterLaneCard key={lane.key} title={lane.title} items={model[lane.key]} empty={lane.empty} />
        ))}
      </div>
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

function ControlCenterLaneCard({ title, items, empty }: { title: string; items: ControlCenterItem[]; empty: string }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "baseline" }}>
        <h3>{title}</h3>
        <span className="badge neutral">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
          {items.slice(0, 5).map((item) => (
            <ControlCenterWorkCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ControlCenterWorkCard({ item }: { item: ControlCenterItem }) {
  const primaryLink = item.links.task ?? item.links.session ?? item.links.agent ?? item.links.approval ?? item.links.timeline;
  const lastUpdated = item.updatedAt ?? item.completedAt ?? item.startedAt;
  const title = primaryLink ? <Link to={primaryLink}>{item.title}</Link> : item.title;

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", justifyContent: "space-between" }}>
        <strong>{title}</strong>
        <span className={`badge ${badgeClassForTone(item.tone)}`}>{item.status}</span>
      </div>
      {item.summary ? <div className="stat-label">{item.summary}</div> : null}
      <div className="stat-label">
        {item.agentLabel ?? "Unknown agent"}
        {item.sessionLabel ? ` · ${item.sessionLabel}` : ""}
        {lastUpdated ? ` · updated ${formatAge(lastUpdated)}` : ""}
      </div>
      <div className="stat-label">Next: {item.nextAction}</div>
      {item.operatorActions?.length ? <OperatorActionChips actions={item.operatorActions} /> : null}
    </div>
  );
}

function OperatorActionChips({ actions }: { actions: OperatorAction[] }) {
  const visible = actions.filter((action) => action.enabled || action.kind !== "navigation").slice(0, 5);
  if (visible.length === 0) return null;
  return (
    <div className="operator-action-chips" aria-label="Safe action affordances">
      {visible.map((action) =>
        action.enabled && action.href ? (
          <Link key={action.id} className="operator-action-chip" to={action.href}>{action.label}</Link>
        ) : (
          <span key={action.id} className="operator-action-chip operator-action-chip-disabled" title={action.disabledReason ?? "Action unavailable"}>
            {action.label} unavailable: {action.disabledReason ?? "missing backend action metadata"}
          </span>
        ),
      )}
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

function InterventionCard({ model }: { model: ReturnType<typeof buildDashboardModel>["interventionSummary"] }) {
  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
        <div>
          <h3>Intervention / Access / Security</h3>
          <p className="stat-label" style={{ marginTop: "0.35rem" }}>
            Unified read-only view of runtime items that may need operator attention.
          </p>
        </div>
        <span className={`badge ${badgeClassForTone(model.tone)}`}>{model.headline}</span>
      </div>
      <div className="grid grid-4" style={{ marginTop: "1rem", marginBottom: "1rem" }}>
        <div>
          <div className="stat-value">{model.counts.total}</div>
          <div className="stat-label">total items</div>
        </div>
        <div>
          <div className="stat-value">{model.counts.intervention}</div>
          <div className="stat-label">intervention</div>
        </div>
        <div>
          <div className="stat-value">{model.counts.access}</div>
          <div className="stat-label">access</div>
        </div>
        <div>
          <div className="stat-value">{model.counts.security}</div>
          <div className="stat-label">security</div>
        </div>
      </div>
      {model.items.length === 0 ? (
        <p className="empty">No failed, stale, disconnected, approval, or posture warnings detected.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Priority</th><th>Category</th><th>Item</th><th>When</th></tr>
          </thead>
          <tbody>
            {model.items.slice(0, 8).map((item) => (
              <tr key={item.id}>
                <td><span className={`badge ${badgeClassForTone(item.tone)}`}>{item.tone}</span></td>
                <td>{item.category}</td>
                <td>
                  {item.links.task ? <Link to={item.links.task}>{item.title}</Link> : item.links.approval ? <Link to={item.links.approval}>{item.title}</Link> : item.title}
                  {item.summary ? <div className="stat-label">{item.summary}</div> : null}
                </td>
                <td>{item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function WorkGraphCard({ graph }: { graph: WorkGraphModel }) {
  const roots = graph.roots.filter((node) => node.kind === "agent" || node.children.length > 0).slice(0, 8);

  return (
    <div id="work-graph" className="card" style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline" }}>
        <h3>Live work graph</h3>
        <div className="stat-label">
          {graph.summary.active} active · {graph.summary.failed} failed · {graph.summary.lost} lost
        </div>
      </div>
      {roots.length === 0 ? (
        <p className="empty">No live agent work reported</p>
      ) : (
        <div style={{ display: "grid", gap: "0.65rem" }}>
          {roots.map((node) => (
            <WorkGraphNodeRow key={node.id} node={node} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkGraphNodeRow({ node, depth }: { node: WorkGraphNode; depth: number }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.65rem",
          paddingLeft: `${depth * 1.25}rem`,
        }}
      >
        <span className={`badge ${badgeClassForStatus(node.status)}`}>{node.status}</span>
        <span className="mono" style={{ color: "var(--ink-muted)", minWidth: "5.5rem" }}>
          {node.role}
        </span>
        {node.links.task ? (
          <strong><Link to={node.links.task}>{node.label}</Link></strong>
        ) : node.links.session ? (
          <strong><Link to={node.links.session}>{node.label}</Link></strong>
        ) : node.links.agent ? (
          <strong><Link to={node.links.agent}>{node.label}</Link></strong>
        ) : (
          <strong>{node.label}</strong>
        )}
        {node.currentTool ? <span className="stat-label">· {node.currentTool}</span> : null}
      </div>
      {node.children.length > 0 ? (
        <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.4rem" }}>
          {node.children.slice(0, 8).map((child) => (
            <WorkGraphNodeRow key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function badgeClassForRuntimeTone(tone: ReturnType<typeof buildDashboardModel>["runtimeStatus"]["tone"]): "ok" | "error" | "warn" | "neutral" {
  if (tone === "ok") return "ok";
  return badgeClassForTone(tone);
}

function badgeClassForStatus(status: WorkGraphStatus): "ok" | "error" | "warn" | "neutral" {
  if (status === "failed" || status === "lost") return "error";
  if (status === "active" || status === "running" || status === "scheduled") return "ok";
  if (status === "queued") return "warn";
  return "neutral";
}

function badgeClassForTone(tone: AttentionTone | "ok"): "ok" | "error" | "warn" | "neutral" {
  if (tone === "error") return "error";
  if (tone === "warn") return "warn";
  if (tone === "ok") return "ok";
  return "neutral";
}
