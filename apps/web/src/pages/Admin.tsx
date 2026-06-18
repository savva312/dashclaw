import { useState } from "react";
import { useAppState } from "../context";
import { executeRpc, requestConfirm } from "../api";
import { isHighRiskRpc } from "@dashclaw/runtime-model";

const QUICK_ACTIONS = [
  { label: "Refresh health", method: "health", params: {} },
  { label: "List agents", method: "agents.list", params: {} },
  { label: "Tail logs", method: "logs.tail", params: { lines: 50 } },
  { label: "Abort session", method: "sessions.abort", params: { key: "agent:main:main" }, write: true },
  { label: "Request gateway restart", method: "gateway.restart.request", params: {}, write: true, highRisk: true },
];

export function AdminPage() {
  const { audit, refresh } = useAppState();
  const [method, setMethod] = useState("health");
  const [params, setParams] = useState("{}");
  const [result, setResult] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const runRpc = async (rpcMethod: string, rpcParams: Record<string, unknown>) => {
    setBusy(true);
    setResult("");
    try {
      let confirmToken: string | undefined;
      if (isHighRiskRpc(rpcMethod)) {
        const confirmed = window.confirm(`High-risk action: ${rpcMethod}. Continue?`);
        if (!confirmed) return;
        const c = await requestConfirm(rpcMethod);
        confirmToken = c.confirmToken;
      }
      const res = await executeRpc(rpcMethod, rpcParams, confirmToken);
      setResult(JSON.stringify(res, null, 2));
      await refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Admin Console</h1>
      <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
        Guarded RPC proxy to the OpenClaw Gateway. High-risk actions require confirmation and are audit-logged.
      </p>

      <div className="grid grid-2">
        <div className="card">
          <h3>Quick Actions</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.method}
                className={`btn ${a.highRisk ? "danger" : a.write ? "primary" : ""}`}
                type="button"
                disabled={busy}
                onClick={() => void runRpc(a.method, a.params)}
              >
                {a.label}
              </button>
            ))}
          </div>

          <h3 style={{ marginTop: "1.5rem" }}>Custom RPC</h3>
          <input
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="method"
            style={{ width: "100%", padding: "0.5rem", marginBottom: "0.5rem", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text)" }}
          />
          <textarea
            value={params}
            onChange={(e) => setParams(e.target.value)}
            rows={4}
            className="mono"
            style={{ width: "100%", padding: "0.5rem", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text)" }}
          />
          <button className="btn primary" type="button" disabled={busy} style={{ marginTop: "0.5rem" }} onClick={() => {
            try {
              void runRpc(method, JSON.parse(params) as Record<string, unknown>);
            } catch {
              setResult("Invalid JSON params");
            }
          }}>
            Execute
          </button>
          {result && (
            <pre className="mono" style={{ marginTop: "1rem", overflow: "auto", maxHeight: "30vh", whiteSpace: "pre-wrap" }}>
              {result}
            </pre>
          )}
        </div>

        <div className="card">
          <h3>Audit Log</h3>
          {audit.length === 0 ? (
            <p className="empty">No admin actions yet</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Time</th><th>Method</th><th>Result</th></tr>
              </thead>
              <tbody>
                {audit.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.timestamp).toLocaleTimeString()}</td>
                    <td className="mono">{e.method}</td>
                    <td><span className={`badge ${e.success ? "ok" : "error"}`}>{e.success ? "ok" : "fail"}</span></td>
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
