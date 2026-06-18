import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthGate } from "./context";
import { Layout } from "./components/Layout";
import { CommandCenterPage } from "./pages/CommandCenter";
import { TimelinePage } from "./pages/Timeline";
import { AgentOfficeLayout } from "./pages/agents/AgentOfficeLayout";
import { AgentOverview } from "./pages/agents/AgentOverview";
import { AgentSessionsView } from "./pages/agents/AgentSessionsView";
import { AgentSessionDetail } from "./pages/agents/AgentSessionDetail";
import { SessionsPage } from "./pages/Sessions";
import { TasksPage } from "./pages/Tasks";
import { CronPage } from "./pages/Cron";
import { ApprovalsPage } from "./pages/Approvals";
import { AdminPage } from "./pages/Admin";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<CommandCenterPage />} />
            <Route path="timeline" element={<TimelinePage />} />
            <Route path="agents" element={<AgentOfficeLayout />}>
              <Route index element={<AgentOverview />} />
              <Route path=":agentId" element={<AgentSessionsView />} />
              <Route path=":agentId/sessions/:sessionKey" element={<AgentSessionDetail />} />
            </Route>
            <Route path="sessions" element={<SessionsPage />} />
            <Route path="cron" element={<CronPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthGate>
  </StrictMode>,
);
