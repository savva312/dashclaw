import { Link } from "react-router-dom";
import { useAppState } from "../context";
import { formatCompactTitle } from "../lib/format";
import { taskLedgerCue } from "../runtime/dashboard";

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
    <div className="page-shell tasks-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Task Ledger</h1>
          <p className="page-subtitle">Durable task history across agents, sessions, and runs.</p>
        </div>
      </div>

      <div className="grid grid-4">
        {(["running", "queued", "failed", "done"] as const).map((k) => (
          <div key={k} className="card stat-card">
            <h3>{k}</h3>
            <div className="stat-value">{groups[k].length}</div>
          </div>
        ))}
      </div>

      <div className="card tasks-table-wrap">
        <table className="table tasks-table">
          <thead>
            <tr><th>Task</th><th>Status</th><th>Activity / result</th><th>Agent</th><th>Session</th><th>Run</th></tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr><td colSpan={6} className="empty">No tasks in ledger</td></tr>
            ) : (
              tasks.map((t) => {
                const cue = taskLedgerCue(t);
                return <tr key={t.id}>
                  <td className="cell-clip">
                    <Link className="text-clip" to={`/tasks/${encodeURIComponent(t.id)}`} title={t.title ?? t.id}>
                      {formatCompactTitle(t.title ?? t.id)}
                    </Link>
                  </td>
                  <td><span className={`badge ${t.status === "running" ? "ok" : t.status === "failed" ? "error" : "neutral"}`}>{t.status}</span></td>
                  <td className="task-ledger-cue">
                    <span className={`badge ${cue.availability === "available" ? "ok" : "neutral"}`}>{cue.label}</span>
                    {cue.summary ? <span className="text-clamp-2" title={cue.summary}>{cue.summary}</span> : null}
                  </td>
                  <td className="text-clip">{t.agentId ? <Link to={`/agents/${encodeURIComponent(t.agentId)}`}>{t.agentId}</Link> : "—"}</td>
                  <td className="mono text-clip">
                    {t.agentId && t.sessionKey ? (
                      <Link to={`/agents/${encodeURIComponent(t.agentId)}/sessions/${encodeURIComponent(t.sessionKey)}`}>{t.sessionKey}</Link>
                    ) : (
                      t.sessionKey ?? "—"
                    )}
                  </td>
                  <td className="mono text-clip">{t.runId ?? "—"}</td>
                </tr>;
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
