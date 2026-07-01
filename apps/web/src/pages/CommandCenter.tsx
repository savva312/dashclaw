import { Link } from "react-router-dom";
import { useAppState } from "../context";
import {
  buildDashboardModel,
  type AttentionTone,
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

      <InterventionCard model={model.interventionSummary} />

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
    <div className="card" style={{ marginBottom: "1.5rem" }}>
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
