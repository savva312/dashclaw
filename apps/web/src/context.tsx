import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuditLogEntry, RuntimeSnapshot, TimelineEvent } from "@dashclaw/runtime-model";
import {
  clearToken,
  fetchAudit,
  fetchSnapshot,
  fetchTimeline,
  getToken,
  isAuthError,
  registerUnauthorizedHandler,
  setToken,
  subscribeEvents,
} from "./api";
import { RUNTIME_POLL_MS, TIMELINE_LIMIT, runtimeKeys } from "./queries";
import { upsertTimelineEvent } from "./timeline";
import { Badge, Button, Input, Panel } from "./ui";

interface AppState {
  snapshot: RuntimeSnapshot | null;
  timeline: TimelineEvent[];
  audit: AuditLogEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  liveConnected: boolean;
}

const AppContext = createContext<AppState | null>(null);
const AuthActionsContext = createContext<{ logout: () => void } | null>(null);

function LoginScreen({
  input,
  setInput,
  onSubmit,
  message,
}: {
  input: string;
  setInput: (value: string) => void;
  onSubmit: () => void;
  message?: string;
}) {
  return (
    <div className="dc-auth-screen">
      <Panel className="dc-auth-card">
        <div className="dc-auth-mark">Clawdeck</div>
        <h1 className="page-title">Dashclaw Agent OS</h1>
        <p style={{ color: "var(--ink-muted)", margin: 0 }}>
          Enter the dashboard token printed by the Dashclaw server on startup.
        </p>
        {message ? (
          <p style={{ marginTop: "1rem" }}>
            <Badge tone="warn">{message}</Badge>
          </p>
        ) : null}
        <Input
          type="password"
          placeholder="Dashboard token"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) onSubmit();
          }}
          style={{ marginTop: "1rem", marginBottom: "0.85rem" }}
        />
        <Button variant="primary" onClick={onSubmit} disabled={!input.trim()} style={{ width: "100%" }}>
          Connect
        </Button>
      </Panel>
    </div>
  );
}

export function AppProvider({
  children,
  authToken,
  onUnauthorized,
}: {
  children: ReactNode;
  authToken: string;
  onUnauthorized: () => void;
}) {
  const queryClient = useQueryClient();
  const [liveConnected, setLiveConnected] = useState(false);

  const snapshotQuery = useQuery({
    queryKey: runtimeKeys.snapshot(),
    queryFn: fetchSnapshot,
    refetchInterval: RUNTIME_POLL_MS,
    retry: (count, err) => !isAuthError(err) && count < 2,
  });

  const timelineQuery = useQuery({
    queryKey: runtimeKeys.timeline(TIMELINE_LIMIT),
    queryFn: () => fetchTimeline(TIMELINE_LIMIT),
    refetchInterval: RUNTIME_POLL_MS,
    retry: (count, err) => !isAuthError(err) && count < 2,
  });

  const auditQuery = useQuery({
    queryKey: runtimeKeys.audit(),
    queryFn: async () => {
      const data = await fetchAudit();
      return data;
    },
    refetchInterval: RUNTIME_POLL_MS,
    retry: (count, err) => !isAuthError(err) && count < 2,
  });

  useEffect(() => {
    for (const err of [snapshotQuery.error, timelineQuery.error, auditQuery.error]) {
      if (isAuthError(err)) onUnauthorized();
    }
  }, [snapshotQuery.error, timelineQuery.error, auditQuery.error, onUnauthorized]);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: runtimeKeys.snapshot() }),
      queryClient.invalidateQueries({ queryKey: runtimeKeys.timeline(TIMELINE_LIMIT) }),
      queryClient.invalidateQueries({ queryKey: runtimeKeys.audit() }),
    ]);
  }, [queryClient]);

  useEffect(() => {
    if (!authToken) return;
    setToken(authToken);
    setLiveConnected(false);
    void refresh();

    const unsubAuth = registerUnauthorizedHandler(onUnauthorized);

    const unsub = subscribeEvents({
      onSnapshot: (snapshot) => {
        setLiveConnected(true);
        queryClient.setQueryData(runtimeKeys.snapshot(), snapshot);
      },
      onTimeline: (event) => {
        queryClient.setQueryData(runtimeKeys.timeline(TIMELINE_LIMIT), (current: TimelineEvent[] | undefined) => {
          return upsertTimelineEvent(current, event, TIMELINE_LIMIT);
        });
      },
      onAudit: (entries) => {
        queryClient.setQueryData(runtimeKeys.audit(), entries);
      },
    });

    return () => {
      unsubAuth();
      unsub();
    };
  }, [authToken, onUnauthorized, queryClient, refresh]);

  const loading = snapshotQuery.isLoading && !snapshotQuery.data;
  const error =
    snapshotQuery.error && !isAuthError(snapshotQuery.error)
      ? snapshotQuery.error instanceof Error
        ? snapshotQuery.error.message
        : String(snapshotQuery.error)
      : null;

  return (
    <AppContext.Provider
      value={{
        snapshot: snapshotQuery.data ?? null,
        timeline: timelineQuery.data ?? [],
        audit: auditQuery.data ?? [],
        loading,
        error,
        refresh,
        liveConnected,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("AppProvider required");
  return ctx;
}

export function useLogout(): () => void {
  const ctx = useContext(AuthActionsContext);
  return (
    ctx?.logout ??
    (() => {
      clearToken();
      window.location.reload();
    })
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [token, setLocalToken] = useState(() => getToken());
  const [input, setInput] = useState("");
  const [authMessage, setAuthMessage] = useState<string | undefined>();

  const logout = useCallback(() => {
    clearToken();
    setLocalToken("");
    setInput("");
    setAuthMessage("Session expired or token invalid. Enter the current dashboard token.");
  }, []);

  const login = useCallback(() => {
    const next = input.trim();
    if (!next) return;
    setToken(next);
    setLocalToken(next);
    setAuthMessage(undefined);
  }, [input]);

  if (!token) {
    return <LoginScreen input={input} setInput={setInput} onSubmit={login} message={authMessage} />;
  }

  return (
    <AuthActionsContext.Provider value={{ logout }}>
      <AppProvider key={token} authToken={token} onUnauthorized={logout}>
        {children}
      </AppProvider>
    </AuthActionsContext.Provider>
  );
}
