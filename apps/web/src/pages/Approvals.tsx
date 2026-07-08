import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useAppState } from "../context";
import { buildDashboardModel, type ApprovalCockpitItem, type AttentionTone } from "../runtime/dashboard";

function badgeClassForTone(tone: AttentionTone | "ok"): "ok" | "error" | "warn" | "neutral" {
  if (tone === "error") return "error";
  if (tone === "warn") return "warn";
  if (tone === "ok") return "ok";
  return "neutral";
}

function formatClock(iso?: string): string {
  if (!iso) return "not reported";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString();
}

export function ApprovalsPage() {
  const { snapshot, timeline } = useAppState();
  const model = useMemo(() => (snapshot ? buildDashboardModel(snapshot, timeline).approvalCockpit : null), [snapshot, timeline]);

  if (!snapshot || !model) return <p>Loading…</p>;

  return (
    <div className="page-shell approvals-page">
      <div className="page-header approvals-header">
        <div>
          <h1 className="page-title">Approval Cockpit</h1>
          <p className="page-subtitle">
            Read-only exec/plugin approval evidence. Decision buttons are disabled until backend confirmation/action metadata is explicit.
          </p>
        </div>
        <div className="approval-cockpit-summary" aria-label="Approval cockpit summary">
          <span className="badge warn">{model.summary.pending} pending</span>
          <span className="badge error">{model.summary["sync-issue"]} sync issue</span>
          <span className="badge error">{model.summary.expired} expired</span>
          <span className="badge ok">{model.summary.resolved} resolved</span>
          <span className="badge neutral">{model.summary.unknown} unknown</span>
        </div>
      </div>

      {model.metadataGaps.length ? (
        <div className="card approval-metadata-gaps">
          <h3>Backend metadata gaps</h3>
          <ul>
            {model.metadataGaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
        </div>
      ) : null}

      {model.items.length === 0 ? (
        <div className="card">
          <p className="empty">No pending approvals or approval timeline evidence reported.</p>
        </div>
      ) : (
        <div className="approval-cockpit-list approval-cockpit-list-full">
          {model.items.map((item) => <ApprovalCockpitDetailCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}

function ApprovalCockpitDetailCard({ item }: { item: ApprovalCockpitItem }) {
  return (
    <article className={`card approval-cockpit-item approval-cockpit-item-${badgeClassForTone(item.tone)}`}>
      <div className="approval-cockpit-head">
        <div>
          <h3>{item.kind === "exec" ? "Exec approval" : item.kind === "plugin" ? "Plugin approval" : "Approval evidence"}</h3>
          <div className="stat-label mono">{item.id}</div>
        </div>
        <span className={`badge ${badgeClassForTone(item.tone)}`}>{item.statusLabel}</span>
      </div>

      <section>
        <div className="stat-label">Exact command text</div>
        <pre className="approval-command">{item.command}</pre>
      </section>

      <dl className="approval-cockpit-details approval-cockpit-details-full">
        <div><dt>cwd</dt><dd className="mono">{item.cwd ?? "not reported"}</dd></div>
        <div><dt>host</dt><dd className="mono">{item.host ?? "not reported"}</dd></div>
        <div><dt>requested</dt><dd>{formatClock(item.requestedAt)}</dd></div>
        <div><dt>timeout/status</dt><dd>{item.timeout ?? "timeout not reported"}</dd></div>
        <div><dt>agent</dt><dd className="mono">{item.origin.agentId ?? "not linked"}</dd></div>
        <div><dt>session</dt><dd className="mono">{item.origin.sessionKey ?? "not linked"}</dd></div>
        <div><dt>task</dt><dd className="mono">{item.origin.taskId ?? "not linked"}</dd></div>
        <div><dt>run</dt><dd className="mono">{item.origin.runId ?? "not linked"}</dd></div>
      </dl>

      <section className="approval-section">
        <strong>Risk summary</strong>
        <p className="approval-risk">{item.riskSummary}</p>
      </section>

      <section className="approval-section">
        <strong>Policy layers</strong>
        <ul>
          {item.policyLayers.map((layer) => <li key={layer}>{layer}</li>)}
        </ul>
      </section>

      <section className="approval-section">
        <strong>Failure / sync hints</strong>
        <ul>
          {item.syncHints.map((hint) => <li key={hint}>{hint}</li>)}
        </ul>
      </section>

      <div className="operator-action-chips" aria-label="Approval evidence links and disabled decisions">
        {item.evidence.map((evidence) => evidence.href ? (
          <Link key={`${evidence.label}:${evidence.href}`} className="operator-action-chip" to={evidence.href}>{evidence.label}</Link>
        ) : (
          <span key={`${evidence.label}:${evidence.detail ?? "detail"}`} className="operator-action-chip">{evidence.label}: {evidence.detail}</span>
        ))}
        {item.disabledActions.map((action) => (
          <span key={action.label} className="operator-action-chip operator-action-chip-disabled" title={action.disabledReason}>
            {action.label}
          </span>
        ))}
      </div>
    </article>
  );
}
