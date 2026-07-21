import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { SessionSummary, TaskSummary } from "@dashclaw/runtime-model";
import { useAppState } from "../context";
import { buildDashboardModel, linksFor, type AttentionTone, type ThreadSessionMapEntry } from "../runtime/dashboard";
import { discordDetail, humanizeDiscordLabel, humanSessionTitle } from "../lib/format";

function badgeClassForTone(tone: AttentionTone | "ok") {
  if (tone === "ok") return "ok";
  if (tone === "error") return "error";
  if (tone === "warn") return "warn";
  return "neutral";
}

function matchesQuery(entry: ThreadSessionMapEntry, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    entry.source.label,
    entry.source.kind,
    entry.source.key,
    entry.source.channelId,
    entry.source.channelName,
    entry.source.threadId,
    entry.source.threadName,
    entry.source.platform,
    entry.state,
    entry.lineage.quality,
    entry.lineage.diagnostic,
    entry.parentSession?.key,
    entry.parentSession?.label,
    ...entry.runIds,
    ...entry.agents.map((agent) => `${agent.id} ${agent.name ?? ""}`),
    ...entry.sessions.map((session) => `${session.key} ${session.label ?? ""} ${session.currentRunId ?? ""}`),
    ...entry.tasks.map((task) => `${task.id} ${task.title ?? ""} ${task.runId ?? ""} ${task.status}`),
    ...entry.approvals.map((approval) => `${approval.id} ${approval.command ?? ""} ${approval.status}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

export function ThreadMapPage() {
  const { snapshot, timeline, loading, error, refresh } = useAppState();
  const [query, setQuery] = useState("");

  const model = useMemo(() => (snapshot ? buildDashboardModel(snapshot, timeline) : null), [snapshot, timeline]);
  const map = model?.threadSessionMap;
  const visibleEntries = useMemo(
    () => (map ? map.entries.filter((entry) => matchesQuery(entry, query)) : []),
    [map, query],
  );

  if (loading && !snapshot) return <p>Loading…</p>;
  if (error) return <p className="badge error">{error}</p>;
  if (!snapshot || !model || !map) return <p>Loading…</p>;

  const diagnostics = map.summary.partialLineage + map.summary.missingLineage + map.metadataGaps.length;
  const displayEntries = visibleEntries.slice(0, 48);
  const truncated = visibleEntries.length > displayEntries.length;

  return (
    <div className="page-shell thread-map-page">
      <div className="page-header thread-map-header">
        <div>
          <h1 className="page-title">Thread Map</h1>
          <p className="page-subtitle">
            Reverse lookup for Discord/source conversations, OpenClaw sessions, child lanes, tasks, and incomplete lineage.
          </p>
        </div>
        <div className="thread-map-actions">
          <Link className="btn" to="/work">Open Work Board</Link>
          <Link className="btn" to="/graph">Open graph</Link>
          <button className="btn" type="button" onClick={() => void refresh()}>Refresh</button>
        </div>
      </div>

      <div className="grid grid-4 thread-map-stats">
        <MapStat label="sources" value={map.summary.total} />
        <MapStat label="threads" value={map.summary.threads} />
        <MapStat label="child sessions" value={map.entries.reduce((sum, entry) => sum + entry.childSessions.length, 0)} />
        <MapStat label="diagnostics" value={diagnostics} tone={diagnostics > 0 ? "warn" : "neutral"} />
      </div>

      <div className="card thread-map-toolbar">
        <label className="thread-map-search">
          <span>Find</span>
          <input
            type="search"
            value={query}
            placeholder="thread, channel, session, task, run, agent…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <span className="stat-label">
          Showing {visibleEntries.length} of {map.entries.length} sources · updated {new Date(snapshot.updatedAt).toLocaleTimeString()}
        </span>
      </div>

      {map.metadataGaps.length > 0 ? (
        <div className="card thread-map-gap-card">
          <h3>Binding metadata gaps</h3>
          <div className="thread-map-diagnostics">
            {map.metadataGaps.map((gap) => <span key={gap} className="badge warn">{gap}</span>)}
          </div>
        </div>
      ) : null}

      {map.entries.length === 0 ? (
        <div className="card thread-map-empty">
          <h3>No mapped conversations</h3>
          <p className="empty">No sessions, tasks, or approvals are available for reverse lookup.</p>
        </div>
      ) : null}

      <div className="thread-map-list" aria-label="Thread and session map rows">
        {displayEntries.map((entry) => <ThreadMapCard key={entry.id} entry={entry} />)}
      </div>
      {truncated ? (
        <p className="stat-label thread-map-truncation">
          Showing {displayEntries.length} of {visibleEntries.length} matching sources. Refine search to narrow results.
        </p>
      ) : null}
    </div>
  );
}

function MapStat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "warn" | "neutral" }) {
  return (
    <div className="card">
      <h3>{label}</h3>
      <div className={`stat-value thread-map-stat-${tone}`}>{value}</div>
    </div>
  );
}

function ThreadMapCard({ entry }: { entry: ThreadSessionMapEntry }) {
  const primaryLink = entry.links.session ?? entry.links.task ?? entry.links.agent ?? "/work";
  const diagnostics = [entry.lineage.diagnostic].filter((value): value is string => Boolean(value));
  const titleDisplay = humanizeDiscordLabel(entry.source.label, entry.source.key);
  const idDetail = discordDetail(entry.source.label, entry.source.key);
  const invalidDiscordPermalink = Boolean(entry.source.permalink && !entry.links.discord);

  return (
    <article className={`thread-map-card thread-map-card-${badgeClassForTone(entry.tone)}`}>
      <div className="thread-map-card-head">
        <div>
          <div className="thread-map-title-row">
            <span className="badge neutral">{entry.source.kind}</span>
            <strong>
              <Link to={primaryLink} title={[entry.source.label, entry.source.key].filter(Boolean).join(" · ")}>
                {titleDisplay.title}
              </Link>
            </strong>
          </div>
          <p className="thread-map-source-line">{sourceLine(entry)}</p>
          {idDetail ? <p className="identity-detail mono text-clip" title={idDetail}>{idDetail}</p> : null}
        </div>
        <span className={`badge ${badgeClassForTone(entry.tone)}`}>{entry.state}</span>
      </div>

      <dl className="thread-map-details">
        <div>
          <dt>Session</dt>
          <dd>{entry.sessions[0] ? sessionLink(entry.sessions[0]) : <span className="identity-detail mono">{shortKey(entry.source.key)}</span>}</dd>
        </div>
        <div>
          <dt>Agent</dt>
          <dd>{entry.links.agent ? <Link to={entry.links.agent}>{agentLabel(entry)}</Link> : agentLabel(entry)}</dd>
        </div>
        <div>
          <dt>Runs</dt>
          <dd className="mono">{entry.runIds.length > 0 ? entry.runIds.join(", ") : "—"}</dd>
        </div>
        <div>
          <dt>Last activity</dt>
          <dd>{entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : "—"}</dd>
        </div>
      </dl>

      <div className="thread-map-relations">
        <RelationList title="Child sessions" sessions={entry.childSessions} />
        <TaskList tasks={entry.tasks} />
      </div>

      {diagnostics.length > 0 ? (
        <div className="thread-map-diagnostics">
          {diagnostics.map((diagnostic) => <span key={diagnostic} className="badge warn">{diagnostic}</span>)}
        </div>
      ) : null}

      <div className="thread-map-links">
        <Link to="/work">Work Board</Link>
        <Link to="/graph">Graph</Link>
        {entry.links.task ? <Link to={entry.links.task}>Task detail</Link> : null}
        {entry.links.session ? <Link to={entry.links.session}>Session detail</Link> : null}
        {entry.links.discord ? <a href={entry.links.discord}>Discord</a> : null}
        {invalidDiscordPermalink ? (
          <span className="identity-detail" title={entry.source.permalink}>
            Discord link unavailable: expected an HTTPS discord.com channel permalink.
          </span>
        ) : null}
      </div>
    </article>
  );
}

function RelationList({ title, sessions }: { title: string; sessions: SessionSummary[] }) {
  return (
    <div>
      <div className="stat-label">{title}</div>
      {sessions.length === 0 ? (
        <p className="empty">No linked child sessions.</p>
      ) : (
        <ul>
          {sessions.map((session) => (
            <li key={session.key}>
              {sessionLink(session)}
              <span className="identity-detail mono text-clip">{discordDetail(session.label, session.key)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskList({ tasks }: { tasks: TaskSummary[] }) {
  return (
    <div>
      <div className="stat-label">Tasks</div>
      {tasks.length === 0 ? (
        <p className="empty">No linked tasks.</p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              <Link className="mono" to={`/tasks/${encodeURIComponent(task.id)}`}>{task.id}</Link>
              <span>{task.title ?? task.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function sourceLine(entry: ThreadSessionMapEntry): string {
  const parentLabel = entry.parentSession
    ? humanSessionTitle(entry.parentSession.label, entry.parentSession.key)
    : undefined;
  const channel = entry.source.channelName
    ? (entry.source.channelName.startsWith("#") ? entry.source.channelName : `#${entry.source.channelName}`)
    : parentLabel
      ?? (entry.source.kind === "channel" ? humanSessionTitle(entry.source.label, entry.source.key) : undefined)
      ?? "channel binding missing";
  const thread = entry.source.threadName
    ?? (entry.source.kind === "thread" ? humanSessionTitle(entry.source.label, entry.source.key) : undefined);
  if (thread && thread !== channel) return `${channel} → ${thread}`;
  return channel;
}

function agentLabel(entry: ThreadSessionMapEntry): string {
  return entry.agents.map((agent) => agent.name ?? agent.id).join(", ") || "—";
}

function sessionLink(session: SessionSummary) {
  const links = linksFor({ agentId: session.agentId, sessionKey: session.key });
  const label = humanSessionTitle(session.label, session.key);
  return links.session ? <Link to={links.session}>{label}</Link> : label;
}

function shortKey(key: string): string {
  const parts = key.split(":");
  return parts.slice(-2).join(":") || key;
}
