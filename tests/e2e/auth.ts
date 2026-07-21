import { expect, type Page } from "@playwright/test";

export const E2E_DASHCLAW_TOKEN = "sec-001-e2e-token-sentinel-not-a-secret";

export async function loginWithE2EToken(page: Page): Promise<void> {
  await page.goto("/");

  const tokenInput = page.getByPlaceholder("Dashboard token");
  await expect(tokenInput).toBeVisible();
  await tokenInput.fill(E2E_DASHCLAW_TOKEN);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(tokenInput).toBeHidden();
}
