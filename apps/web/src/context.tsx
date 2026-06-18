import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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
    <div className="auth-screen">
      <div className="card auth-card">
        <h1 className="page-title">Dashclaw Agent OS</h1>
        <p style={{ color: "var(--text-muted)", margin: 0 }}>
          Enter the dashboard token printed by the Dashclaw server on startup.
        </p>
        {message ? (
          <p className="badge warn" style={{ marginTop: "1rem" }}>
            {message}
          </p>
        ) : null}
        <input
          type="password"
          placeholder="Dashboard token"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) onSubmit();
          }}
        />
        <button className="btn primary" type="button" onClick={onSubmit} disabled={!input.trim()}>
          Connect
        </button>
      </div>
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
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [s, t, a] = await Promise.all([fetchSnapshot(), fetchTimeline(), fetchAudit()]);
      setSnapshot(s);
      setTimeline(t);
      setAudit(a);
      setLoading(false);
    } catch (err) {
      if (isAuthError(err)) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    if (!authToken) return;
    setToken(authToken);
    setLoading(true);
    setSnapshot(null);
    setTimeline([]);
    setAudit([]);
    setLiveConnected(false);
    void refresh();

    const unsubAuth = registerUnauthorizedHandler(onUnauthorized);

    const unsub = subscribeEvents({
      onSnapshot: (s) => {
        setLiveConnected(true);
        setSnapshot(s);
      },
      onTimeline: (e) => setTimeline((prev) => [...prev.slice(-199), e]),
      onAudit: setAudit,
    });

    const poll = setInterval(() => {
      void refresh();
    }, 3_000);

    return () => {
      unsubAuth();
      unsub();
      clearInterval(poll);
    };
  }, [authToken, onUnauthorized, refresh]);

  return (
    <AppContext.Provider value={{ snapshot, timeline, audit, loading, error, refresh, liveConnected }}>
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
