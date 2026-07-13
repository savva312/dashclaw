import { useState } from "react";
import { useAppState } from "../context";
import { fetchSessionPreview } from "../api";
import { formatCompactTitle } from "../lib/format";
import { WorktreeMetadata } from "./agents/WorktreeMetadata";

export function SessionsPage() {
  const { snapshot } = useAppState();
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const sessions = snapshot?.sessions ?? [];

  const loadPreview = async (key: string) => {
    setSelected(key);
    setLoading(true);
    try {
      const data = await fetchSessionPreview(key);
      setPreview(data);
    } catch {
      setPreview({ error: "Failed to load session preview" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell sessions-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Session Trace</h1>
          <p className="page-subtitle">Browse active sessions and inspect a read-only trace preview.</p>
        </div>
      </div>

      <div className="grid grid-2 sessions-grid">
        <div className="card">
          <h3>Sessions ({sessions.length})</h3>
          {sessions.length === 0 ? (
            <p className="empty">No sessions</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Session</th><th>Agent</th><th>Status</th><th>Working copy</th></tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.key}
                    className={selected === s.key ? "table-row-selected" : undefined}
                    style={{ cursor: "pointer" }}
                    onClick={() => void loadPreview(s.key)}
                  >
                    <td className="cell-clip">
                      <span className="text-clip" title={s.label ?? s.key}>{formatCompactTitle(s.label ?? s.key, 48)}</span>
                    </td>
                    <td className="text-clip">{s.agentId ?? "—"}</td>
                    <td>
                      <span className={`badge ${s.isActive ? "ok" : "neutral"}`}>
                        {s.isActive ? "active" : "idle"}
                      </span>
                    </td>
                    <td><WorktreeMetadata worktree={s.worktree} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card sessions-preview-card">
          <h3>Trace Preview</h3>
          {!selected ? (
            <p className="empty">Select a session to inspect</p>
          ) : loading ? (
            <p>Loading…</p>
          ) : (
            <pre className="mono code-preview">{JSON.stringify(preview, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
