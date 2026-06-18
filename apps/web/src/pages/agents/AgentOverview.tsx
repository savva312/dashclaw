import { useAppState } from "../../context";
import { OfficeBreadcrumb } from "./OfficeBreadcrumb";
import { AgentCard } from "./AgentCard";
import { buildAllAgentStats } from "./utils";

export function AgentOverview() {
  const { snapshot } = useAppState();
  if (!snapshot) return <p className="office-loading">Loading agents…</p>;

  const rows = buildAllAgentStats(snapshot);
  const workingCount = rows.filter((row) => row.isWorking).length;
  const idleCount = rows.length - workingCount;

  return (
    <div className="office-page">
      <OfficeBreadcrumb items={[{ label: "Agent Office" }]} />

      <header className="office-hero">
        <div>
          <h1 className="page-title">Agent Office</h1>
          <p className="office-subtitle">Your fleet at a glance — pick an agent to drill into sessions.</p>
        </div>
        <div className="office-stat-strip">
          <div className="office-stat">
            <span className="office-stat-value">{workingCount}</span>
            <span className="office-stat-label">working</span>
          </div>
          <div className="office-stat">
            <span className="office-stat-value">{idleCount}</span>
            <span className="office-stat-label">idle</span>
          </div>
          <div className="office-stat">
            <span className="office-stat-value">{rows.length}</span>
            <span className="office-stat-label">total</span>
          </div>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="empty">No agents configured</p>
      ) : (
        <div className="agent-grid">
          {rows.map((row) => (
            <AgentCard key={row.agent.id} stats={row} />
          ))}
        </div>
      )}
    </div>
  );
}
