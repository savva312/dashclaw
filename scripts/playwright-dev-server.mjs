#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  buildChildEnvironment,
  cleanupOwnedDatabase,
  createOwnedDatabase,
} from "./playwright-dev-server-utils.mjs";

const token = process.env.DASHCLAW_E2E_TOKEN;
if (!token) {
  throw new Error("DASHCLAW_E2E_TOKEN must be set by the Playwright configuration");
}

const scenario = process.env.DASHCLAW_FAKE_GATEWAY_SCENARIO || "discord-workflow";
const ownedDatabase = createOwnedDatabase();

const children = new Set();

function start(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: buildChildEnvironment(env),
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  const prefix = `[${name}]`;
  child.stdout.on("data", (chunk) => process.stdout.write(`${prefix} ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`${prefix} ${chunk}`));
  child.on("error", (error) => {
    console.error(`${prefix} failed to start:`, error);
    shutdown(1);
  });
  child.on("close", (code, signal) => {
    children.delete(child);
    if (shuttingDown) {
      finishShutdownIfReady();
    } else if (code !== 0) {
      console.error(`${prefix} exited with code ${code ?? signal}`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

let shuttingDown = false;
let shutdownCode = 0;
let forceKillTimer;
let forcedExitTimer;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdownCode = code;
  for (const child of children) child.kill("SIGTERM");

  if (children.size === 0) {
    finishShutdownIfReady();
    return;
  }

  forceKillTimer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    forcedExitTimer = setTimeout(() => {
      if (children.size > 0) {
        console.error(
          `[playwright] child processes did not stop; leaving owned directory at ${ownedDatabase.directory}`,
        );
        process.exit(shutdownCode || 1);
      }
    }, 500);
  }, 2_000);
}

function finishShutdownIfReady() {
  if (!shuttingDown || children.size > 0) return;
  clearTimeout(forceKillTimer);
  clearTimeout(forcedExitTimer);

  let exitCode = shutdownCode;
  try {
    cleanupOwnedDatabase(ownedDatabase);
  } catch (error) {
    exitCode ||= 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[playwright] ${message}; leaving owned directory at ${ownedDatabase.directory}`,
    );
  } finally {
    process.exit(exitCode);
  }
}

function shutdownAfterFatalError(error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[playwright] fatal launcher error: ${message}`);
  shutdown(1);
}

process.on("uncaughtException", shutdownAfterFatalError);
process.on("unhandledRejection", shutdownAfterFatalError);
process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
process.on("exit", () => {
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // Best effort only: exit handlers cannot wait for child termination.
    }
  }
});

start("server", "corepack", ["pnpm", "--filter", "@dashclaw/server", "dev"], {
  DASHCLAW_FAKE_GATEWAY: "1",
  DASHCLAW_FAKE_GATEWAY_SCENARIO: scenario,
  DASHCLAW_FAKE_GATEWAY_ASSISTANT_SESSION: "agent:dashclaw:discord:thread:work-board:subagent:model",
  DASHCLAW_DB: ownedDatabase.databasePath,
  DASHCLAW_TOKEN: token,
  DASHCLAW_DASHBOARD_TOKEN: token,
});

start("web", "corepack", ["pnpm", "--filter", "@dashclaw/web", "dev"], {});

// Keep this process alive; Playwright terminates it after the run.
setInterval(() => {}, 60_000);
