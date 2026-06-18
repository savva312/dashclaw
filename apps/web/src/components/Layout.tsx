import { NavLink, Outlet } from "react-router-dom";
import { useAppState, useLogout } from "../context";
import { Button, LiveIndicator } from "../ui";

const NAV = [
  { section: "Ops", items: [{ to: "/", label: "Command Center", end: true }, { to: "/timeline", label: "Live Timeline" }] },
  {
    section: "Runtime",
    items: [
      { to: "/agents", label: "Agent Office" },
      { to: "/sessions", label: "Session Trace" },
      { to: "/tasks", label: "Task Ledger" },
      { to: "/cron", label: "Cron" },
      { to: "/approvals", label: "Approvals" },
    ],
  },
  { section: "Control", items: [{ to: "/admin", label: "Admin Console" }] },
] as const;

export function Layout() {
  const { snapshot, liveConnected } = useAppState();
  const logout = useLogout();
  const conn = snapshot?.connectionState ?? "disconnected";
  const updated = snapshot?.updatedAt ? new Date(snapshot.updatedAt).toLocaleTimeString() : "—";
  const connected = conn === "connected";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-glyph">DC</span>
          <div>
            <div className="sidebar-brand-name">
              Dash<span>claw</span>
            </div>
            <div className="sidebar-brand-tag">Agent OS</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((group) => (
            <div key={group.section} className="sidebar-nav-group">
              <div className="sidebar-nav-label">{group.section}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={"end" in item ? item.end : false}
                  className={({ isActive }) => `sidebar-nav-link ${isActive ? "is-active" : ""}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-status">
          <div className="sidebar-status-title">Runtime link</div>
          <div className="sidebar-status-row">
            <span className={`sidebar-status-dot ${connected ? "is-on" : "is-off"}`} aria-hidden />
            <span className="sidebar-status-label">Gateway</span>
            <span className={`sidebar-status-value ${connected ? "is-on" : "is-off"}`}>{conn}</span>
          </div>
          <div className="sidebar-status-row">
            <span className="sidebar-status-label">Stream</span>
            <LiveIndicator live={liveConnected} className="sidebar-status-live" />
          </div>
          <div className="sidebar-status-meta">Updated {updated}</div>
          <Button type="button" variant="ghost" className="sidebar-logout" onClick={logout}>
            Re-enter token
          </Button>
        </div>
      </aside>

      <main className="main dc-shell-grid-bg">
        <Outlet />
      </main>
    </div>
  );
}
