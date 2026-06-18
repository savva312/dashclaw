import { useAppState } from "../context";

export function TasksPage() {
  const { snapshot } = useAppState();
  const tasks = snapshot?.tasks ?? [];

  const groups = {
    running: tasks.filter((t) => t.status === "running"),
    queued: tasks.filter((t) => t.status === "queued"),
    failed: tasks.filter((t) => t.status === "failed" || t.status === "timed_out"),
    done: tasks.filter((t) => t.status === "completed" || t.status === "cancelled"),
  };

  return (
    <>
      <h1 className="page-title">Task Ledger</h1>
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        {(["running", "queued", "failed", "done"] as const).map((k) => (
          <div key={k} className="card">
            <h3>{k}</h3>
            <div className="stat-value">{groups[k].length}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Task</th><th>Status</th><th>Agent</th><th>Session</th><th>Run</th></tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr><td colSpan={5} className="empty">No tasks in ledger</td></tr>
            ) : (
              tasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.title ?? t.id}</td>
                  <td><span className={`badge ${t.status === "running" ? "ok" : t.status === "failed" ? "error" : "neutral"}`}>{t.status}</span></td>
                  <td>{t.agentId ?? "—"}</td>
                  <td className="mono">{t.sessionKey ?? "—"}</td>
                  <td className="mono">{t.runId ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
