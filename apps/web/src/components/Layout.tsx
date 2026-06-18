import { NavLink, Outlet } from "react-router-dom";
import { useAppState, useLogout } from "../context";

export function Layout() {
  const { snapshot, liveConnected } = useAppState();
  const logout = useLogout();
  const conn = snapshot?.connectionState ?? "disconnected";
  const updated = snapshot?.updatedAt ? new Date(snapshot.updatedAt).toLocaleTimeString() : "—";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          Dash<span>claw</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Command Center</NavLink>
          <NavLink to="/timeline">Live Timeline</NavLink>
          <NavLink to="/agents">Agent Office</NavLink>
          <NavLink to="/sessions">Session Trace</NavLink>
          <NavLink to="/tasks">Task Ledger</NavLink>
          <NavLink to="/cron">Cron</NavLink>
          <NavLink to="/approvals">Approvals</NavLink>
          <NavLink to="/admin">Admin Console</NavLink>
        </nav>
        <div className="connection-bar">
          <span className={`dot ${conn === "connected" ? "connected" : "disconnected"}`} />
          Gateway: {conn}
          <br />
          Live: {liveConnected ? "on" : "polling"}
          <br />
          Updated: {updated}
          <br />
          <button className="btn" type="button" style={{ marginTop: "0.75rem", width: "100%" }} onClick={logout}>
            Re-enter token
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
