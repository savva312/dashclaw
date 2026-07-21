import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { Link } from "react-router-dom";
import { RUNTIME_LIMITS } from "@dashclaw/runtime-model";
import { useAppState } from "../context";
import { SessionOperationalBadges, sessionOperationalBadges } from "./agents/SessionOperational";
import {
  buildDashboardModel,
  type DeliveryRecoveryState,
  type RuntimeLinks,
  type WorkGraphEdge,
  type WorkGraphModel,
  type WorkGraphNode,
  type WorkGraphStatus,
} from "../runtime/dashboard";

interface GraphLayoutNode {
  node: WorkGraphNode;
  x: number;
  y: number;
  depth: number;
}

interface GraphLayoutEdge {
  edge: WorkGraphEdge;
  from: GraphLayoutNode;
  to: GraphLayoutNode;
}

interface GraphLayout {
  nodes: GraphLayoutNode[];
  edges: GraphLayoutEdge[];
  width: number;
  height: number;
}

type StatusFilter = "all" | "active" | "attention" | "failed";

const NODE_WIDTH = 214;
const NODE_HEIGHT = 66;
const COLUMN_GAP = 265;
const ROW_GAP = 92;
const CANVAS_PADDING = 48;

export function WorkGraphPage() {
  const { snapshot, timeline, loading, error, refresh } = useAppState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.92);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [query, setQuery] = useState("");

  const model = useMemo(() => (snapshot ? buildDashboardModel(snapshot, timeline) : null), [snapshot, timeline]);
  const graph = model?.workGraph;
  const visibleGraph = useMemo(
    () => (graph ? filterGraph(graph, statusFilter, query) : null),
    [graph, statusFilter, query],
  );
  const layout = useMemo(() => (visibleGraph ? layoutGraph(visibleGraph) : null), [visibleGraph]);
  const selectedNode = selectedId ? graph?.nodes.find((node) => node.id === selectedId) : undefined;

  const resetView = () => {
    setZoom(0.92);
    setPan({ x: 0, y: 0 });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,a,input,select,textarea")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    setIsPanning(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
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
    const nextZoom = clampZoom(zoom * Math.exp(-event.deltaY * 0.001));
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;
    setZoom(nextZoom);
    setPan({
      x: mouseX - worldX * nextZoom,
      y: mouseY - worldY * nextZoom,
    });
  };

  if (loading && !snapshot) return <p>Loading…</p>;
  if (error) return <p className="badge error">{error}</p>;
  if (!snapshot || !model || !graph || !visibleGraph || !layout) return <p>Loading…</p>;

  return (
    <div className="page-shell work-graph-page">
      <div className="page-header work-graph-header">
        <div>
          <h1 className="page-title">Work Graph</h1>
          <p className="page-subtitle">
            Full live lineage view of agents, sessions, subagents, tasks, cron jobs, and failure paths.
          </p>
        </div>
        <div className="work-graph-actions">
          <button className="btn" type="button" onClick={() => setZoom((value) => clampZoom(value - 0.12))}>
            −
          </button>
          <input
            aria-label="Graph zoom"
            className="work-graph-zoom"
            type="range"
            min="0.45"
            max="1.6"
            step="0.05"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <button className="btn" type="button" onClick={() => setZoom((value) => clampZoom(value + 0.12))}>
            +
          </button>
          <button className="btn" type="button" onClick={resetView}>
            Reset view
          </button>
          <button className="btn" type="button" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-4 work-graph-stats">
        <GraphStat label="nodes" value={graph.nodes.length} />
        <GraphStat label="edges" value={graph.edges.length} />
        <GraphStat label="active" value={graph.summary.active} tone="ok" />
        <GraphStat label="attention" value={graph.summary.failed + graph.summary.lost} tone="error" />
      </div>

      <div className="work-graph-toolbar card">
        <label className="work-graph-search">
          <span>Find</span>
          <input
            type="search"
            value={query}
            placeholder="agent, subagent, task, run, session…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="work-graph-filter" role="group" aria-label="Filter graph by status">
          {(["all", "active", "attention", "failed"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`btn ${statusFilter === value ? "primary" : ""}`}
              onClick={() => setStatusFilter(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="stat-label work-graph-toolbar-note">
          Showing {visibleGraph.nodes.length} of {graph.nodes.length} nodes · drag to pan · scroll to zoom · click a node to inspect.
        </div>
      </div>

      <div className="work-graph-layout">
        <section className="work-graph-canvas card" aria-label="Agent and subagent work graph">
          {layout.nodes.length === 0 ? (
            <p className="empty">No graph nodes match this filter.</p>
          ) : (
            <div
              ref={viewportRef}
              className={`work-graph-scroll ${isPanning ? "is-panning" : ""}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopPanning}
              onPointerCancel={stopPanning}
              onWheel={handleWheel}
            >
              <svg
                className="work-graph-svg"
                width={Math.max(layout.width, 760)}
                height={Math.max(layout.height, 420)}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                role="img"
                aria-label="Live work graph"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              >
                <defs>
                  <marker id="work-graph-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
                    <path d="M 0 0 L 9 4.5 L 0 9 z" className="work-graph-arrow" />
                  </marker>
                </defs>
                <g>
                  {layout.edges.map(({ edge, from, to }) => (
                    <GraphEdgePath key={`${edge.from}->${edge.to}`} from={from} to={to} kind={edge.kind} />
                  ))}
                </g>
                <g>
                  {layout.nodes.map((item) => (
                    <GraphNodeCard
                      key={item.node.id}
                      item={item}
                      selected={item.node.id === selectedId}
                      onSelect={() => setSelectedId(item.node.id)}
                    />
                  ))}
                </g>
              </svg>
            </div>
          )}
        </section>

        <aside className="work-graph-detail card">
          {selectedNode ? (
            <WorkGraphDetail node={selectedNode} />
          ) : (
            <div>
              <h3>Inspect a node</h3>
              <p className="stat-label">
                Click any agent, session, subagent, task, or cron node to see exact status, lineage, and jump links.
              </p>
              <div className="work-graph-legend">
                {(["active", "queued", "failed", "lost", "idle"] as WorkGraphStatus[]).map((status) => (
                  <span key={status} className={`badge ${badgeClassForStatus(status)}`}>{status}</span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function GraphStat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "ok" | "error" | "neutral" }) {
  return (
    <div className="card">
      <h3>{label}</h3>
      <div className={`stat-value work-graph-stat-${tone}`}>{value}</div>
    </div>
  );
}

function GraphEdgePath({ from, to, kind }: { from: GraphLayoutNode; to: GraphLayoutNode; kind: WorkGraphEdge["kind"] }) {
  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_HEIGHT / 2;
  const mid = x1 + Math.max(36, (x2 - x1) / 2);
  const path = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;

  return <path className={`work-graph-edge work-graph-edge-${kind}`} d={path} markerEnd="url(#work-graph-arrow)" />;
}

function GraphNodeCard({
  item,
  selected,
  onSelect,
}: {
  item: GraphLayoutNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const { node, x, y } = item;
  const title = truncate(node.label, 24);
  const operationalSignal = node.session ? sessionOperationalBadges(node.session)[0]?.label : undefined;
  const subtitle = truncate(operationalSignal ?? node.currentTool ?? node.task?.runId ?? node.session?.currentRunId ?? node.cronJob?.schedule ?? node.id, 28);

  return (
    <g
      className={`work-graph-node work-graph-node-${node.status} ${selected ? "is-selected" : ""}`}
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect();
      }}
    >
      <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="14" />
      <circle className="work-graph-node-dot" cx="18" cy="20" r="5" />
      <text className="work-graph-node-role" x="32" y="23">{node.role}</text>
      <text className="work-graph-node-title" x="16" y="43">{title}</text>
      <text className="work-graph-node-subtitle" x="16" y="58">{subtitle}</text>
    </g>
  );
}

function WorkGraphDetail({ node }: { node: WorkGraphNode }) {
  return (
    <div>
      <div className="work-graph-detail-head">
        <span className={`badge ${badgeClassForStatus(node.status)}`}>{node.status}</span>
        <span className="badge neutral">{node.role}</span>
      </div>
      {node.session ? <SessionOperationalBadges session={node.session} /> : null}
      <h3>{node.label}</h3>
      <dl className="work-graph-detail-list">
        <DetailRow label="kind" value={node.kind} />
        <DetailRow label="agent" value={node.agent?.name ?? node.agent?.id} />
        <DetailRow label="session" value={node.session?.key} mono />
        <DetailRow label="task" value={node.task?.id} mono />
        <DetailRow label="run" value={node.task?.runId ?? node.session?.currentRunId} mono />
        <DetailRow label="tool" value={node.currentTool} />
        <DetailRow label="parent" value={node.parentId} mono />
        <DetailRow label="updated" value={formatTime(node.updatedAt)} />
      </dl>
      {node.deliveryRecovery ? (
        <div className="work-graph-delivery-card">
          <div className="work-graph-detail-head">
            <span className={`badge ${badgeClassForDeliveryTone(node.deliveryRecovery.tone)}`}>{node.deliveryRecovery.label}</span>
            <span className="badge neutral">delivery</span>
          </div>
          <p className="stat-label">{node.deliveryRecovery.summary}</p>
          {node.deliveryRecovery.needsRecovery ? (
            <p className="stat-label">Recovery actions are read-only here; open the task for evidence and safety reasons.</p>
          ) : null}
        </div>
      ) : null}
      {node.task?.error ? <p className="work-graph-error">{node.task.error}</p> : null}
      <GraphLinks links={node.links} />
      {node.children.length > 0 ? (
        <div className="work-graph-child-list">
          <div className="stat-label">Children</div>
          {node.children.map((child) => (
            <div key={child.id} className="work-graph-child-row">
              <span className={`badge ${badgeClassForStatus(child.status)}`}>{child.status}</span>
              <span>{child.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{value}</dd>
    </>
  );
}

function badgeClassForDeliveryTone(tone: DeliveryRecoveryState["tone"]): string {
  if (tone === "ok") return "ok";
  if (tone === "error") return "error";
  if (tone === "warn") return "warn";
  return "neutral";
}

function GraphLinks({ links }: { links: RuntimeLinks }) {
  const items = [
    { label: "Open agent", to: links.agent },
    { label: "Open session", to: links.session },
    { label: "Open task", to: links.task },
    { label: "Timeline", to: links.timeline },
    { label: "Approvals", to: links.approval },
  ].filter((item): item is { label: string; to: string } => Boolean(item.to));

  if (items.length === 0) return null;
  return (
    <div className="work-graph-links">
      {items.map((item) => (
        <Link key={`${item.label}:${item.to}`} className="btn" to={item.to}>
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function layoutGraph(graph: WorkGraphModel): GraphLayout {
  const nodes: GraphLayoutNode[] = [];
  let row = 0;

  const visit = (node: WorkGraphNode, depth: number) => {
    const currentRow = row;
    row += 1;
    nodes.push({
      node,
      depth,
      x: CANVAS_PADDING + depth * COLUMN_GAP,
      y: CANVAS_PADDING + currentRow * ROW_GAP,
    });
    for (const child of node.children) visit(child, depth + 1);
  };

  for (const root of graph.roots) visit(root, 0);

  const byId = new Map(nodes.map((item) => [item.node.id, item]));
  const edges = graph.edges.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    return from && to ? [{ edge, from, to }] : [];
  });
  const maxDepth = Math.max(0, ...nodes.map((item) => item.depth));

  return {
    nodes,
    edges,
    width: CANVAS_PADDING * 2 + NODE_WIDTH + maxDepth * COLUMN_GAP,
    height: Math.max(420, CANVAS_PADDING * 2 + Math.max(nodes.length, 1) * ROW_GAP),
  };
}

function filterGraph(graph: WorkGraphModel, statusFilter: StatusFilter, query: string): WorkGraphModel {
  const normalizedQuery = query.trim().toLowerCase();
  const includeIds = new Set<string>();
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  for (const node of graph.nodes) {
    if (!matchesStatus(node, statusFilter) || !matchesQuery(node, normalizedQuery)) continue;
    includeWithAncestors(node, nodeById, includeIds);
    for (const child of node.children) includeIds.add(child.id);
  }

  if (statusFilter === "all" && !normalizedQuery) {
    for (const node of graph.nodes) includeIds.add(node.id);
  }

  if (includeIds.size > RUNTIME_LIMITS.browser.maxRenderedGraphNodes) {
    const prioritized = graph.nodes
      .filter((node) => includeIds.has(node.id))
      .sort((a, b) => Number(isActiveStatus(b.status)) - Number(isActiveStatus(a.status)));
    includeIds.clear();
    for (const node of prioritized) {
      if (includeIds.size >= RUNTIME_LIMITS.browser.maxRenderedGraphNodes) break;
      includeWithAncestors(node, nodeById, includeIds);
    }
    for (const id of [...includeIds].slice(RUNTIME_LIMITS.browser.maxRenderedGraphNodes)) {
      includeIds.delete(id);
    }
  }

  const cloneById = new Map<string, WorkGraphNode>();
  for (const node of graph.nodes) {
    if (!includeIds.has(node.id)) continue;
    cloneById.set(node.id, { ...node, children: [] });
  }

  const roots: WorkGraphNode[] = [];
  const edges: WorkGraphEdge[] = [];
  for (const node of graph.nodes) {
    const clone = cloneById.get(node.id);
    if (!clone) continue;
    const parent = node.parentId ? cloneById.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(clone);
      const edge = graph.edges.find((candidate) => candidate.from === parent.id && candidate.to === clone.id);
      if (edge) edges.push(edge);
    } else {
      roots.push(clone);
    }
  }

  const nodes = [...cloneById.values()];
  return {
    roots,
    nodes,
    edges,
    summary: {
      roots: roots.length,
      children: nodes.filter((node) => node.kind !== "agent").length,
      active: nodes.filter((node) => isActiveStatus(node.status)).length,
      failed: nodes.filter((node) => node.status === "failed").length,
      lost: nodes.filter((node) => node.status === "lost").length,
      hiddenInactive: graph.nodes.filter((node) => !includeIds.has(node.id) && !isActiveStatus(node.status)).length,
    },
  };
}

function includeWithAncestors(node: WorkGraphNode, nodeById: Map<string, WorkGraphNode>, includeIds: Set<string>): void {
  includeIds.add(node.id);
  let current = node;
  while (current.parentId) {
    const parent = nodeById.get(current.parentId);
    if (!parent || includeIds.has(parent.id)) break;
    includeIds.add(parent.id);
    current = parent;
  }
}

function matchesStatus(node: WorkGraphNode, statusFilter: StatusFilter): boolean {
  if (statusFilter === "all") return true;
  if (statusFilter === "active") return isActiveStatus(node.status);
  if (statusFilter === "attention") return node.status === "failed" || node.status === "lost";
  return node.status === "failed";
}

function matchesQuery(node: WorkGraphNode, query: string): boolean {
  if (!query) return true;
  return [
    node.id,
    node.label,
    node.role,
    node.status,
    node.agent?.id,
    node.agent?.name,
    node.session?.key,
    node.session?.currentRunId,
    node.session?.model,
    node.session?.modelProvider,
    node.session?.agentRuntime,
    node.session?.agentRuntimeSource,
    node.session?.parentSessionKey,
    node.session?.spawnedBy,
    node.session?.ownerSessionKey,
    node.session?.subagentRole,
    node.session?.subagentControlScope,
    node.session?.subagentRunState,
    node.session?.deliveryContext?.channel,
    node.session?.deliveryContext?.to,
    node.session?.origin?.provider,
    node.session?.origin?.surface,
    node.task?.id,
    node.task?.title,
    node.task?.runId,
    node.currentTool,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function isActiveStatus(status: WorkGraphStatus): boolean {
  return status === "active" || status === "running" || status === "queued";
}

function badgeClassForStatus(status: WorkGraphStatus): "ok" | "error" | "warn" | "neutral" {
  if (status === "failed" || status === "lost") return "error";
  if (status === "active" || status === "running" || status === "scheduled") return "ok";
  if (status === "queued") return "warn";
  return "neutral";
}

function clampZoom(value: number): number {
  return Math.min(2.25, Math.max(0.45, Number(value.toFixed(2))));
}

function formatTime(iso?: string): string | undefined {
  return iso ? new Date(iso).toLocaleString() : undefined;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
