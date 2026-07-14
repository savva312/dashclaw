import type { SessionSummary, SessionWorktreeSummary } from "@dashclaw/runtime-model";

export function ExecutionContext({
  session,
  variant = "compact",
}: {
  session: Pick<SessionSummary, "spawnedCwd" | "spawnedWorkspaceDir" | "worktree">;
  variant?: "compact" | "full";
}) {
  const hasDirectoryContext = Boolean(session.spawnedCwd || session.spawnedWorkspaceDir);
  if (variant === "compact" && !hasDirectoryContext && !session.worktree) return null;

  return (
    <div className={`execution-context execution-context-${variant}`} aria-label="Reported execution context">
      <div className="execution-context-group">
        <span className="execution-context-marker">Execution context</span>
        {(variant === "full" || session.spawnedCwd) ? (
          <ContextValue label="Working directory" value={session.spawnedCwd ?? "not reported"} />
        ) : null}
        {(variant === "full" || session.spawnedWorkspaceDir) ? (
          <ContextValue label="Workspace" value={session.spawnedWorkspaceDir ?? "not reported"} />
        ) : null}
        {variant === "full" ? (
          <span className="execution-context-note">Reported by OpenClaw; filesystem availability is not checked.</span>
        ) : null}
      </div>
      {session.worktree ? <ExplicitWorktree worktree={session.worktree} variant={variant} /> : null}
    </div>
  );
}

function ExplicitWorktree({
  worktree,
  variant,
}: {
  worktree: SessionWorktreeSummary;
  variant: "compact" | "full";
}) {
  return (
    <div className="execution-context-group explicit-worktree" aria-label="Explicitly reported worktree context">
      <span className="execution-context-marker">Worktree (reported)</span>
      <ContextValue label="Branch" value={worktree.branch ?? "not reported"} />
      <ContextValue label="Path" value={worktree.path ?? "not reported"} />
      {variant === "full" ? <ContextValue label="Repository" value={worktree.repoRoot ?? "not reported"} /> : null}
      {variant === "full" ? <ContextValue label="ID" value={worktree.id ?? "not reported"} /> : null}
    </div>
  );
}

function ContextValue({ label, value }: { label: string; value: string }) {
  return (
    <span className="execution-context-value">
      <span className="execution-context-value-label">{label}</span>
      <code className="mono" title={value}>
        {value}
      </code>
    </span>
  );
}
