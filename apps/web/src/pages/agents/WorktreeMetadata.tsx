import type { SessionWorktreeSummary } from "@dashclaw/runtime-model";

export function WorktreeMetadata({
  worktree,
  variant = "compact",
}: {
  worktree?: SessionWorktreeSummary;
  variant?: "compact" | "full";
}) {
  if (!worktree) return null;

  return (
    <div className={`worktree-meta worktree-meta-${variant}`} aria-label="Worktree context">
      <span className="worktree-marker">Worktree</span>
      <WorktreeValue label="Branch" value={worktree.branch ?? "branch not reported"} />
      <WorktreeValue label="Path" value={worktree.path ?? "path not reported"} />
      {variant === "full" && worktree.repoRoot ? (
        <WorktreeValue label="Repository" value={worktree.repoRoot} />
      ) : null}
      {variant === "full" && worktree.id ? <WorktreeValue label="ID" value={worktree.id} /> : null}
    </div>
  );
}

function WorktreeValue({ label, value }: { label: string; value: string }) {
  return (
    <span className="worktree-value">
      <span className="worktree-value-label">{label}</span>
      <code className="mono" title={value}>
        {value}
      </code>
    </span>
  );
}
