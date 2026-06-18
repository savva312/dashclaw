import { useState } from "react";
import { useAppState } from "../context";
import { fetchSessionPreview } from "../api";

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
    <>
      <h1 className="page-title">Session Trace</h1>
      <div className="grid grid-2">
        <div className="card">
          <h3>Sessions</h3>
          {sessions.length === 0 ? (
            <p className="empty">No sessions</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Session</th><th>Agent</th><th>Status</th></tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.key}
                    style={{ cursor: "pointer", background: selected === s.key ? "var(--bg-elevated)" : undefined }}
                    onClick={() => void loadPreview(s.key)}
                  >
                    <td>{s.label ?? s.key}</td>
                    <td>{s.agentId ?? "—"}</td>
                    <td>
                      <span className={`badge ${s.isActive ? "ok" : "neutral"}`}>
                        {s.isActive ? "active" : "idle"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>Trace Preview</h3>
          {!selected ? (
            <p className="empty">Select a session to inspect</p>
          ) : loading ? (
            <p>Loading…</p>
          ) : (
            <pre className="mono" style={{ overflow: "auto", maxHeight: "60vh", whiteSpace: "pre-wrap" }}>
              {JSON.stringify(preview, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </>
  );
}
