import { defineConfig, devices } from "@playwright/test";
import { E2E_DASHCLAW_TOKEN } from "./tests/e2e/auth";

const webPort = Number(process.env.VITE_PORT ?? "5173");
const baseURL = `http://127.0.0.1:${webPort}`;

process.env.DASHCLAW_E2E_TOKEN = E2E_DASHCLAW_TOKEN;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
  ],
  webServer: {
    command: "node scripts/playwright-dev-server.mjs",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    gracefulShutdown: {
      signal: "SIGTERM",
      timeout: 3_000,
    },
  },
});
