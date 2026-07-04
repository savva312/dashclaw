import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthGate } from "./context";
import { Layout } from "./components/Layout";
import { CommandCenterPage } from "./pages/CommandCenter";
import { TimelinePage } from "./pages/Timeline";
import { WorkBoardPage } from "./pages/WorkBoard";
import { WorkGraphPage } from "./pages/WorkGraph";
import { AgentOfficeLayout } from "./pages/agents/AgentOfficeLayout";
import { AgentOverview } from "./pages/agents/AgentOverview";
import { AgentSessionsView } from "./pages/agents/AgentSessionsView";
import { AgentSessionDetail } from "./pages/agents/AgentSessionDetail";
import { SessionsPage } from "./pages/Sessions";
import { TasksPage } from "./pages/Tasks";
import { TaskDetailPage } from "./pages/TaskDetail";
import { CronPage } from "./pages/Cron";
import { ApprovalsPage } from "./pages/Approvals";
import { AdminPage } from "./pages/Admin";
import "./ui/tokens.css";
import "./ui/clawdeck.css";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1_000,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<CommandCenterPage />} />
              <Route path="timeline" element={<TimelinePage />} />
              <Route path="work" element={<WorkBoardPage />} />
              <Route path="graph" element={<WorkGraphPage />} />
              <Route path="agents" element={<AgentOfficeLayout />}>
                <Route index element={<AgentOverview />} />
                <Route path=":agentId" element={<AgentSessionsView />} />
                <Route path=":agentId/sessions/:sessionKey" element={<AgentSessionDetail />} />
              </Route>
              <Route path="sessions" element={<SessionsPage />} />
              <Route path="cron" element={<CronPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="tasks/:taskId" element={<TaskDetailPage />} />
              <Route path="approvals" element={<ApprovalsPage />} />
              <Route path="admin" element={<AdminPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthGate>
    </QueryClientProvider>
  </StrictMode>,
);
