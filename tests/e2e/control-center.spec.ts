import { expect, test } from "@playwright/test";
import { loginWithE2EToken } from "./auth";

test.describe("Discord workflow browser smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginWithE2EToken(page);
  });

  test("renders the Command Center with safe action affordances", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible();
    await expect(page.getByText("What needs you next — open an item to drill into task, session, or agent detail.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Work board" }).first()).toBeVisible();
  });

  test("renders the Work Board review queue and operator action chips", async ({ page }) => {
    await page.goto("/work");

    await expect(page.getByRole("heading", { name: "Work Board" })).toBeVisible();
    await expect(page.getByText("Review queue")).toBeVisible();
    await expect(page.getByText("Completed, failed, and human-review work")).toBeVisible();
    await expect(page.getByRole("link", { name: "Task detail" }).first()).toBeVisible();
    await expect(page.getByLabel("Disabled recovery actions").first()).toBeVisible();
    await expect(page.getByText("subagent active", { exact: true }).first()).toBeVisible();
  });

  test("renders the Thread Map with lineage diagnostics", async ({ page }) => {
    await page.goto("/map");

    await expect(page.getByRole("heading", { name: "Thread Map" })).toBeVisible();
    await expect(page.getByText("Reverse lookup for Discord/source conversations")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Binding metadata gaps" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open work board" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Discord", exact: true })).toHaveCount(0);

    await page.goto("/graph");
    await expect(page.getByRole("heading", { name: "Work Graph" })).toBeVisible();
    await expect(page.getByText("subagent active", { exact: true }).first()).toBeVisible();
  });

  test("renders the approval cockpit without enabling unsafe decisions", async ({ page }) => {
    await page.goto("/approvals");

    await expect(page.getByRole("heading", { name: "Approval Cockpit" })).toBeVisible();
    await expect(page.getByText("Read-only exec/plugin approval evidence")).toBeVisible();
    await expect(page.getByText("Exact command text").first()).toBeVisible();
    await expect(page.locator(".operator-action-chip-disabled").filter({ hasText: "Approve once" }).first()).toBeVisible();
    await expect(page.getByText(/approve\/deny\/allowlist mutation disabled/).first()).toBeVisible();
  });

  test("separates reported directories from explicit worktree metadata", async ({ page }) => {
    const branch = "agent/task-039-fixture-model-lane";
    const path = "/workspace/.worktrees/task-039-fixture-model-lane";

    await page.goto("/agents");
    await expect(page.getByLabel("Explicitly reported worktree context").filter({ hasText: branch }).first()).toContainText(path);

    await page.goto("/agents/fixture-model");
    await expect(page.getByLabel("Reported execution context").filter({ hasText: path }).first()).toContainText("Workspace");
    await expect(page.getByLabel("Explicitly reported worktree context").filter({ hasText: branch }).first()).toContainText(path);

    await page.goto(`/agents/fixture-model/sessions/${encodeURIComponent("agent:dashclaw:discord:thread:work-board:subagent:model")}`);
    await expect(page.getByLabel("Reported execution context")).toContainText("Working directory");
    await expect(page.getByLabel("Explicitly reported worktree context").filter({ hasText: branch })).toContainText(path);
    const evidence = page.getByLabel("Session runtime and lineage evidence");
    await expect(evidence).toContainText("Runtime identity");
    await expect(evidence).toContainText("openai/gpt-5.6-terra");
    await expect(evidence).toContainText("fixture-model");
    await expect(evidence).toContainText("thread-work-board");

    await page.goto("/agents/dashclaw");
    const pathOnlyContext = page
      .getByLabel("Reported execution context")
      .filter({ hasText: "/workspace/dashclaw-worktrees/deleted-archived-context" });
    await expect(pathOnlyContext).toContainText("Working directory");
    await expect(pathOnlyContext).not.toContainText("Worktree (reported)");
  });

  test("contains literal-percent route identifiers without crashing", async ({ page }) => {
    await page.goto("/tasks/literal%25");
    await expect(page.getByText("Task not found", { exact: true })).toBeVisible();

    await page.goto("/agents/literal%25");
    await expect(page.getByText("Agent not found", { exact: true })).toBeVisible();

    await page.goto("/agents/literal%25/sessions/session%25key");
    await expect(page.getByText("Session not found", { exact: true })).toBeVisible();
    await expect(page.getByText("This page could not be displayed", { exact: true })).toHaveCount(0);
  });

  test("renders one coherent assistant response while tool activity stays separate", async ({ page }) => {
    await page.goto(`/agents/fixture-model/sessions/${encodeURIComponent("agent:dashclaw:discord:thread:work-board:subagent:model")}`);

    await expect(page.getByText("I’m checking the runtime now.", { exact: true })).toBeVisible();
    await expect(page.getByText("I’m checking ", { exact: true })).toHaveCount(0);
    await expect(page.getByText("the runtime now.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Session tool: read", { exact: true })).toBeVisible();
  });

  test("renders task progress, terminal results, runtime, and lineage without inventing delivery", async ({ page }) => {
    await page.goto("/tasks/task-work-board");
    await expect(page.getByRole("heading", { name: "Progress, Result & Failure" })).toBeVisible();
    await expect(page.getByText("Coordinating fixture implementation and review", { exact: true })).toBeVisible();
    await expect(page.getByText("flow-work-board", { exact: true })).toBeVisible();
    await expect(page.getByText("agent:dashclaw:discord:thread:work-board:subagent:model", { exact: true })).toBeVisible();

    await page.goto("/tasks/task-thread-summary");
    await expect(page.getByText("Completed summary was delivered to Discord.", { exact: true })).toBeVisible();
    await expect(page.getByText("Result available; delivery unknown", { exact: true })).toBeVisible();

    await page.goto("/tasks/task-lost-background-result");
    await expect(page.getByText("Terminal result unavailable", { exact: true }).first()).toBeVisible();
  });

  test("keeps the dashboard credential out of request URLs", async ({ page }) => {
    const requestUrls: string[] = [];
    page.on("request", (request) => requestUrls.push(request.url()));
    const eventRequestPromise = page.waitForRequest(
      (request) => new URL(request.url()).pathname === "/api/events",
    );

    await page.goto("/");
    const eventRequest = await eventRequestPromise;

    expect(new URL(eventRequest.url()).search).toBe("");
    const authorization = eventRequest.headers().authorization;
    expect(authorization).toMatch(/^Bearer .+$/);
    const token = authorization.slice("Bearer ".length);
    expect(requestUrls.every((url) => !url.includes(token) && !url.includes(encodeURIComponent(token)))).toBe(true);
  });
});
