#!/usr/bin/env node
import { spawn } from "node:child_process";

const token = process.env.DASHCLAW_TOKEN || "test-token";
const scenario = process.env.DASHCLAW_FAKE_GATEWAY_SCENARIO || "discord-workflow";

const children = new Set();

function start(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  const prefix = `[${name}]`;
  child.stdout.on("data", (chunk) => process.stdout.write(`${prefix} ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`${prefix} ${chunk}`));
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown && code !== 0) {
      console.error(`${prefix} exited with code ${code ?? signal}`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 2_000).unref();
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
process.on("exit", () => {
  for (const child of children) child.kill("SIGTERM");
});

start("server", "corepack", ["pnpm", "--filter", "@dashclaw/server", "dev"], {
  DASHCLAW_FAKE_GATEWAY: "1",
  DASHCLAW_FAKE_GATEWAY_SCENARIO: scenario,
  DASHCLAW_TOKEN: token,
  DASHCLAW_DASHBOARD_TOKEN: token,
});

start("web", "corepack", ["pnpm", "--filter", "@dashclaw/web", "dev"], {
  VITE_DASHCLAW_TOKEN: token,
});

// Keep this process alive; Playwright terminates it after the run.
setInterval(() => {}, 60_000);
