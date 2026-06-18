import { useState } from "react";
import { useAppState } from "../context";
import { executeRpc } from "../api";

export function ApprovalsPage() {
  const { snapshot, refresh } = useAppState();
  const approvals = snapshot?.approvals ?? [];
  const pending = approvals.filter((a) => a.status === "pending");
  const [busy, setBusy] = useState<string | null>(null);

  const resolve = async (id: string, decision: "approved" | "denied") => {
    setBusy(id);
    try {
      await executeRpc("exec.approval.resolve", { id, decision });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h1 className="page-title">Approvals Center</h1>
      <div className="card">
        <h3>Pending ({pending.length})</h3>
        {pending.length === 0 ? (
          <p className="empty">No pending approvals</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Kind</th><th>Command</th><th>Session</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {pending.map((a) => (
                <tr key={a.id}>
                  <td>{a.kind}</td>
                  <td className="mono">{a.command ?? a.id}</td>
                  <td className="mono">{a.sessionKey ?? "—"}</td>
                  <td>
                    <button className="btn primary" type="button" disabled={busy === a.id} onClick={() => void resolve(a.id, "approved")}>Approve</button>
                    <button className="btn danger" type="button" style={{ marginLeft: 8 }} disabled={busy === a.id} onClick={() => void resolve(a.id, "denied")}>Deny</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
