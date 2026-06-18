import { useAppState } from "../context";

function formatUptime(ms?: number): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

export function CommandCenterPage() {
  const { snapshot, loading, error, refresh } = useAppState();

  if (loading && !snapshot) return <p>Loading…</p>;
  if (error) return <p className="badge error">{error}</p>;
  if (!snapshot) return <p>Loading…</p>;

  const s = snapshot!;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title">Command Center</h1>
        <button className="btn" type="button" onClick={() => void refresh()}>Refresh</button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <h3>Gateway</h3>
          <div className="stat-value">
            <span className={`badge ${s.connectionState === "connected" ? "ok" : "error"}`}>
              {s.connectionState}
            </span>
          </div>
          <div className="stat-label">v{s.health?.version ?? "—"} · uptime {formatUptime(s.health?.uptimeMs)}</div>
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
                    <td>{a.name ?? a.id}</td>
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
                    <td>{t.title ?? t.id}</td>
                    <td><span className={`badge ${t.status === "running" ? "ok" : t.status === "failed" ? "error" : "neutral"}`}>{t.status}</span></td>
                    <td>{t.agentId ?? "—"}</td>
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
