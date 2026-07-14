import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExecutionContext } from "./ExecutionContext";

describe("ExecutionContext", () => {
  it("shows a worktree-looking path only as a reported working directory", () => {
    const markup = renderToStaticMarkup(
      <ExecutionContext
        session={{
          spawnedCwd: "/workspace/dashclaw-worktrees/task-045",
          spawnedWorkspaceDir: "/workspace/dashclaw",
        }}
      />,
    );

    expect(markup).toContain("Working directory");
    expect(markup).toContain("/workspace/dashclaw-worktrees/task-045");
    expect(markup).toContain("Workspace");
    expect(markup).not.toContain("Worktree (reported)");
    expect(markup).not.toContain("Branch");
  });

  it("keeps future explicit worktree metadata in a separately labelled section", () => {
    const markup = renderToStaticMarkup(
      <ExecutionContext
        session={{
          spawnedCwd: "/workspace/reported-cwd",
          worktree: {
            id: "task-045",
            branch: "agent/task-045",
            path: "/workspace/explicit-worktree",
            repoRoot: "/workspace/dashclaw",
          },
        }}
        variant="full"
      />,
    );

    expect(markup).toContain("Execution context");
    expect(markup).toContain("Worktree (reported)");
    expect(markup).toContain("agent/task-045");
    expect(markup).toContain("/workspace/explicit-worktree");
  });

  it("renders unavailable directory fields in full detail without substituting a repository path", () => {
    const markup = renderToStaticMarkup(<ExecutionContext session={{}} variant="full" />);

    expect(markup.match(/title="not reported"/g)).toHaveLength(2);
    expect(markup).not.toContain("Worktree");
  });
});
