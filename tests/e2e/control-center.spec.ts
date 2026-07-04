import { expect, test } from "@playwright/test";

test.describe("Discord workflow browser smoke", () => {
  test("renders the Command Center with safe action affordances", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible();
    await expect(page.getByText("Active work and operator action queue.")).toBeVisible();
    await expect(page.getByLabel("Safe action affordances").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Open work board" }).first()).toBeVisible();
  });

  test("renders the Work Board review queue and operator action chips", async ({ page }) => {
    await page.goto("/work");

    await expect(page.getByRole("heading", { name: "Work Board" })).toBeVisible();
    await expect(page.getByText("Review queue")).toBeVisible();
    await expect(page.getByText("Completed, failed, and human-review work")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open task" }).first()).toBeVisible();
    await expect(page.getByLabel("Safe action affordances").first()).toBeVisible();
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
    await expect(page.getByText("Approve once unavailable").first()).toBeVisible();
    await expect(page.getByText("disabled in read-only cockpit until backend action metadata").first()).toBeVisible();
  });
});
