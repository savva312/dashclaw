import { useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { useAppState } from "../context";
import { buildDashboardModel, type WorkGraphModel, type WorkGraphNode, type WorkGraphStatus } from "../runtime/dashboard";

function formatUptime(ms?: number): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

export function CommandCenterPage() {
  const { snapshot, timeline, loading, error, refresh } = useAppState();

  if (loading && !snapshot) return <p>Loading…</p>;
  if (error) return <p className="badge error">{error}</p>;
  if (!snapshot) return <p>Loading…</p>;

  const s = snapshot!;
  const model = buildDashboardModel(s, timeline);

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

      <WorkGraphCard graph={model.workGraph} />

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

function WorkGraphCard({ graph }: { graph: WorkGraphModel }) {
  const roots = graph.roots.filter((node) => node.kind === "agent" || node.children.length > 0).slice(0, 8);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);

  const resetView = () => setView({ x: 0, y: 0, zoom: 1 });

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,a,input,select,textarea")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
    };
    setIsPanning(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setView((current) => ({
      ...current,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }));
  };

  const stopPanning = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setIsPanning(false);
    }
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextZoom = clamp(view.zoom * Math.exp(-event.deltaY * 0.001), 0.5, 2.25);
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const worldX = (mouseX - view.x) / view.zoom;
    const worldY = (mouseY - view.y) / view.zoom;
    setView({
      zoom: nextZoom,
      x: mouseX - worldX * nextZoom,
      y: mouseY - worldY * nextZoom,
    });
  };

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline" }}>
        <h3>Live work graph</h3>
        <div className="stat-label">
          {graph.summary.active} active now · {graph.summary.hiddenInactive} hidden inactive
        </div>
      </div>
      {roots.length === 0 ? (
        <p className="empty">No active agent work right now</p>
      ) : (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", marginBottom: "0.65rem" }}>
            <span className="stat-label">Drag to pan · scroll to zoom · {Math.round(view.zoom * 100)}%</span>
            <button className="btn small" type="button" onClick={resetView}>Reset view</button>
          </div>
          <div
            ref={viewportRef}
            className={`work-graph-viewport ${isPanning ? "is-panning" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopPanning}
            onPointerCancel={stopPanning}
            onWheel={handleWheel}
          >
            <div
              className="work-graph-canvas"
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
            >
              {roots.map((node) => (
                <WorkGraphNodeRow key={node.id} node={node} depth={0} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkGraphNodeRow({ node, depth }: { node: WorkGraphNode; depth: number }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.65rem",
          paddingLeft: `${depth * 1.25}rem`,
        }}
      >
        <span className={`badge ${badgeClassForStatus(node.status)}`}>{node.status}</span>
        <span className="mono" style={{ color: "var(--ink-muted)", minWidth: "5.5rem" }}>
          {node.role}
        </span>
        <strong>{node.label}</strong>
        {node.currentTool ? <span className="stat-label">· {node.currentTool}</span> : null}
      </div>
      {node.children.length > 0 ? (
        <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.4rem" }}>
          {node.children.slice(0, 8).map((child) => (
            <WorkGraphNodeRow key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function badgeClassForStatus(status: WorkGraphStatus): "ok" | "error" | "warn" | "neutral" {
  if (status === "failed" || status === "lost") return "error";
  if (status === "active" || status === "running" || status === "scheduled") return "ok";
  if (status === "queued") return "warn";
  return "neutral";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
