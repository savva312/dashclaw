import { useState } from "react";
import { useAppState } from "../context";
import { executeRpc, requestConfirm } from "../api";
import { isHighRiskRpc, safeOutputString } from "@dashclaw/runtime-model";
import { safeRawPreview } from "../validation";

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
        const c = await requestConfirm(rpcMethod, rpcParams);
        confirmToken = c.confirmToken;
      }
      const res = await executeRpc(rpcMethod, rpcParams, confirmToken);
      setResult(safeRawPreview(res));
      await refresh();
    } catch (err) {
      setResult(safeOutputString(err instanceof Error ? err.message : String(err), 1_000));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-shell admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Console</h1>
          <p className="page-subtitle">
            Guarded RPC proxy to the OpenClaw Gateway. High-risk confirmations help prevent accidents; they are not a
            second authentication factor.
          </p>
        </div>
      </div>

      <div className="grid grid-2 admin-grid">
        <div className="card">
          <h3>Quick Actions</h3>
          <div className="admin-action-row">
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

          <h3 className="admin-section-title">Custom RPC</h3>
          <input
            className="form-input"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="method"
          />
          <textarea
            value={params}
            onChange={(e) => setParams(e.target.value)}
            rows={4}
            className="form-input mono"
          />
          <button
            className="btn primary"
            type="button"
            disabled={busy}
            onClick={() => {
              try {
                void runRpc(method, JSON.parse(params) as Record<string, unknown>);
              } catch {
                setResult("Invalid JSON params");
              }
            }}
          >
            Execute
          </button>
          {result ? <pre className="mono code-preview code-preview-short">{result}</pre> : null}
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
                    <td className="mono text-clip">{e.method}</td>
                    <td><span className={`badge ${e.success ? "ok" : "error"}`}>{e.success ? "ok" : "fail"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
