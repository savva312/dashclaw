import { expect, test } from "@playwright/test";

test.describe("Discord workflow browser smoke", () => {
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
  });

  test("renders the Thread Map with lineage diagnostics", async ({ page }) => {
    await page.goto("/map");

    await expect(page.getByRole("heading", { name: "Thread Map" })).toBeVisible();
    await expect(page.getByText("Reverse lookup for Discord/source conversations")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Binding metadata gaps" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open work board" }).first()).toBeVisible();
  });

  test("renders the approval cockpit without enabling unsafe decisions", async ({ page }) => {
    await page.goto("/approvals");

    await expect(page.getByRole("heading", { name: "Approval Cockpit" })).toBeVisible();
    await expect(page.getByText("Read-only exec/plugin approval evidence")).toBeVisible();
    await expect(page.getByText("Exact command text").first()).toBeVisible();
    await expect(page.locator(".operator-action-chip-disabled").filter({ hasText: "Approve once" }).first()).toBeVisible();
    await expect(page.getByText(/approve\/deny\/allowlist mutation disabled/).first()).toBeVisible();
  });

  test("shows explicit worktree branch and path on agent and session surfaces", async ({ page }) => {
    const branch = "agent/task-039-fixture-model-lane";
    const path = "/workspace/.worktrees/task-039-fixture-model-lane";

    await page.goto("/agents");
    await expect(page.getByLabel("Worktree context").filter({ hasText: branch }).first()).toContainText(path);

    await page.goto("/agents/fixture-model");
    await expect(page.getByLabel("Worktree context").filter({ hasText: branch }).first()).toContainText(path);

    await page.goto(`/agents/fixture-model/sessions/${encodeURIComponent("agent:dashclaw:discord:thread:work-board:subagent:model")}`);
    await expect(page.getByLabel("Worktree context").filter({ hasText: branch })).toContainText(path);
  });

  test("renders one coherent assistant response while tool activity stays separate", async ({ page }) => {
    await page.goto(`/agents/fixture-model/sessions/${encodeURIComponent("agent:dashclaw:discord:thread:work-board:subagent:model")}`);

    await expect(page.getByText("I’m checking the runtime now.", { exact: true })).toBeVisible();
    await expect(page.getByText("I’m checking ", { exact: true })).toHaveCount(0);
    await expect(page.getByText("the runtime now.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Session tool: read", { exact: true })).toBeVisible();
  });
});
