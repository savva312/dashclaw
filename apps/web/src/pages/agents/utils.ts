import type { AgentSummary, RuntimeSnapshot, SessionSummary, TaskSummary, TimelineEvent } from "@dashclaw/runtime-model";

export interface AgentOfficeStats {
  agent: AgentSummary;
  sessions: SessionSummary[];
  activeSessions: SessionSummary[];
  activeTask?: TaskSummary;
  primarySession?: SessionSummary;
  isWorking: boolean;
  currentLabel?: string;
  currentTool?: string;
}

export function groupSessionsByAgent(snapshot: RuntimeSnapshot): Map<string, SessionSummary[]> {
  const map = new Map<string, SessionSummary[]>();
  for (const session of snapshot.sessions) {
    const agentId = session.agentId ?? "unknown";
    const list = map.get(agentId) ?? [];
    list.push(session);
    map.set(agentId, list);
  }
  return map;
}

export function buildAgentStats(snapshot: RuntimeSnapshot, agent: AgentSummary): AgentOfficeStats {
  const sessions = sortSessions(groupSessionsByAgent(snapshot).get(agent.id) ?? []);
  const activeSessions = sessions.filter((s) => s.isActive);
  const runningTasks = snapshot.tasks.filter((task) => task.agentId === agent.id && task.status === "running");
  const activeTask =
    runningTasks.find((task) => activeSessions.some((session) => session.key === task.sessionKey)) ??
    runningTasks[0];
  const taskSession = activeTask?.sessionKey
    ? activeSessions.find((session) => session.key === activeTask.sessionKey)
    : undefined;
  const primarySession = taskSession ?? activeSessions[0];
  const isWorking = activeSessions.length > 0 || Boolean(activeTask);

  return {
    agent,
    sessions,
    activeSessions,
    activeTask,
    primarySession,
    isWorking,
    currentLabel:
      activeTask?.title ??
      activeTask?.id ??
      primarySession?.label ??
      shortSessionKey(primarySession?.key),
    currentTool: primarySession?.currentTool ?? activeSessions.find((s) => s.currentTool)?.currentTool,
  };
}

export function buildAllAgentStats(snapshot: RuntimeSnapshot): AgentOfficeStats[] {
  return snapshot.agents
    .map((agent) => buildAgentStats(snapshot, agent))
    .sort((a, b) => {
      if (a.isWorking !== b.isWorking) return a.isWorking ? -1 : 1;
      return (a.agent.name ?? a.agent.id).localeCompare(b.agent.name ?? b.agent.id);
    });
}

export function sortSessions(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((a, b) => {
    if (Boolean(a.isActive) !== Boolean(b.isActive)) return a.isActive ? -1 : 1;
    const ta = parseTime(a.updatedAt ?? a.lastInteractionAt);
    const tb = parseTime(b.updatedAt ?? b.lastInteractionAt);
    return tb - ta;
  });
}

export function parseSessionKind(key: string): string {
  const parts = key.split(":");
  if (parts.length >= 3) return parts[2] ?? "unknown";
  return "unknown";
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case "discord":
      return "Discord";
    case "subagent":
      return "Sub-agent";
    case "dashboard":
      return "Dashboard";
    case "cron":
      return "Cron";
    default:
      return kind;
  }
}

export function agentInitials(agent: AgentSummary): string {
  const source = agent.name ?? agent.id;
  const parts = source.split(/[-_\s]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function agentAccentHue(agentId: string): number {
  let hash = 0;
  for (let i = 0; i < agentId.length; i += 1) hash = (hash * 31 + agentId.charCodeAt(i)) >>> 0;
  return hash % 360;
}

export function sessionStatusLabel(session: SessionSummary): string {
  if (session.isActive) return "active";
  return session.status ?? "idle";
}

export function sessionStatusTone(session: SessionSummary): "ok" | "error" | "neutral" | "warn" {
  if (session.isActive) return "ok";
  if (session.status === "failed" || session.status === "timeout") return "error";
  if (session.status === "running") return "warn";
  return "neutral";
}

export function shortSessionKey(key?: string): string | undefined {
  if (!key) return undefined;
  const parts = key.split(":");
  if (parts.length >= 5 && parts[2] === "discord") return `discord:${parts[parts.length - 1]?.slice(0, 8)}…`;
  if (parts.length >= 4) return `${parts[2]}:${parts[3]?.slice(0, 8)}…`;
  return key.length > 42 ? `${key.slice(0, 40)}…` : key;
}

export function sessionDisplayName(session: SessionSummary): string {
  return session.label ?? shortSessionKey(session.key) ?? session.key;
}

export function matchesQuery(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return text.toLowerCase().includes(q);
}

export function sessionMatchesQuery(session: SessionSummary, query: string): boolean {
  return matchesQuery(
    [
      session.label,
      session.key,
      session.agentId,
      session.currentTool,
      session.status,
      session.worktree?.branch,
      session.worktree?.path,
    ].filter(Boolean).join(" "),
    query,
  );
}

export function agentMatchesQuery(agent: AgentSummary, query: string): boolean {
  return matchesQuery([agent.id, agent.name, agent.model, agent.runtime].filter(Boolean).join(" "), query);
}

export function groupSessionsByKind(sessions: SessionSummary[]): Array<{ kind: string; sessions: SessionSummary[] }> {
  const order = ["discord", "subagent", "dashboard", "cron"];
  const map = new Map<string, SessionSummary[]>();

  for (const session of sessions) {
    const kind = parseSessionKind(session.key);
    const list = map.get(kind) ?? [];
    list.push(session);
    map.set(kind, list);
  }

  const known = order
    .filter((kind) => map.has(kind))
    .map((kind) => ({ kind, sessions: sortSessions(map.get(kind) ?? []) }));

  const rest = [...map.entries()]
    .filter(([kind]) => !order.includes(kind))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, list]) => ({ kind, sessions: sortSessions(list) }));

  return [...known, ...rest];
}

export function eventKindTone(kind: string): "ok" | "warn" | "neutral" | "error" | "accent" {
  if (kind.includes("tool") || kind === "session.tool" || kind === "agent.tool") return "warn";
  if (kind.includes("approval")) return "error";
  if (kind === "session.message" || kind === "chat" || kind === "agent.assistant") return "accent";
  if (kind.includes("lifecycle") || kind === "sessions.changed") return "ok";
  return "neutral";
}

export function eventKindShort(kind: string): string {
  return kind.replace("agent.", "").replace("session.", "").replace("gateway.", "");
}

export function formatPreviewText(text: string, role?: string): string {
  const trimmed = text.trim();
  if (role !== "tool" || !trimmed.startsWith("{")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.status === "string") return `status: ${parsed.status}`;
    if (typeof parsed.message === "string") return parsed.message;
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    /* keep raw */
  }
  return trimmed;
}

export function formatRelativeTime(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  const delta = Date.now() - ms;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Date(ms).toLocaleString();
}

export function formatClock(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString();
}

export function filterTimelineForSession(events: TimelineEvent[], sessionKey: string): TimelineEvent[] {
  return events.filter((event) => event.sessionKey === sessionKey).slice(-40);
}

function parseTime(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}
