import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  cleanupOwnedDatabase,
  createOwnedDatabase,
  isPathInsideOwnedDirectory,
} from "./playwright-dev-server-utils.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const launcherPath = join(repoRoot, "scripts", "playwright-dev-server.mjs");
const sentinelContents = Buffer.from("external production database sentinel\n");

test("rejects parent traversal and symlink escapes before cleanup", () => {
  const owned = createOwnedDatabase();
  const externalDirectory = mkdtempSync(join(tmpdir(), "dashclaw-external-"));
  const sentinel = join(externalDirectory, "production.db");
  writeFileSync(sentinel, sentinelContents);

  try {
    assert.equal(
      isPathInsideOwnedDirectory(
        owned,
        join(owned.directory, "nested", "..", "dashclaw.db"),
      ),
      true,
    );
    assert.equal(
      isPathInsideOwnedDirectory(
        owned,
        join(owned.directory, "..", "production.db"),
      ),
      false,
    );

    symlinkSync(sentinel, owned.databasePath);
    assert.equal(isPathInsideOwnedDirectory(owned, owned.databasePath), false);
    assert.throws(
      () => cleanupOwnedDatabase(owned),
      /database path escapes the owned directory/,
    );
    assert.deepEqual(readFileSync(sentinel), sentinelContents);
    assert.equal(existsSync(owned.directory), true);

    unlinkSync(owned.databasePath);
    cleanupOwnedDatabase(owned);
  } finally {
    rmSync(owned.directory, { force: true, recursive: true });
    rmSync(externalDirectory, { force: true, recursive: true });
  }
});

test("ignores an inherited database and cleans on Playwright termination", async (t) => {
  const harness = createHarness("normal");
  const sentinel = createSentinel(harness.root);
  const launched = launch(harness, sentinel);
  registerCleanup(t, harness, launched);

  const starts = await waitForStarts(harness, 2);
  const serverStart = starts.find((entry) => entry.role === "server");
  const webStart = starts.find((entry) => entry.role === "web");
  assert.ok(serverStart?.db);
  assert.equal(webStart?.db, null);
  assert.notEqual(serverStart.db, sentinel);
  await waitFor(() => existsSync(`${serverStart.db}-shm`));

  launched.child.kill("SIGTERM");
  const result = await launched.completion;

  assert.equal(result.code, 143, result.output);
  assert.deepEqual(readFileSync(sentinel), sentinelContents);
  assert.equal(existsSync(dirname(serverStart.db)), false);
});

test("preserves an inherited database when a child fails", async (t) => {
  const harness = createHarness("fail");
  const sentinel = createSentinel(harness.root);
  const launched = launch(harness, sentinel);
  registerCleanup(t, harness, launched);

  const starts = await waitForStarts(harness, 2);
  const serverStart = starts.find((entry) => entry.role === "server");
  assert.ok(serverStart?.db);

  const result = await launched.completion;

  assert.equal(result.code, 23, result.output);
  assert.deepEqual(readFileSync(sentinel), sentinelContents);
  assert.equal(existsSync(dirname(serverStart.db)), false);
});

test("waits for stubborn children before SIGINT cleanup", async (t) => {
  const harness = createHarness("stubborn");
  const sentinel = createSentinel(harness.root);
  const launched = launch(harness, sentinel);
  registerCleanup(t, harness, launched);

  const starts = await waitForStarts(harness, 2);
  const serverStart = starts.find((entry) => entry.role === "server");
  assert.ok(serverStart?.db);

  launched.child.kill("SIGINT");
  const result = await launched.completion;

  assert.equal(result.code, 130, result.output);
  assert.deepEqual(readFileSync(sentinel), sentinelContents);
  assert.equal(existsSync(dirname(serverStart.db)), false);
});

test("allocates independent directories for parallel launchers", async (t) => {
  const firstHarness = createHarness("normal");
  const secondHarness = createHarness("normal");
  const sentinel = createSentinel(firstHarness.root);
  const first = launch(firstHarness, sentinel);
  const second = launch(secondHarness, sentinel);
  registerCleanup(t, firstHarness, first);
  registerCleanup(t, secondHarness, second);

  const [firstStarts, secondStarts] = await Promise.all([
    waitForStarts(firstHarness, 2),
    waitForStarts(secondHarness, 2),
  ]);
  const firstDb = firstStarts.find((entry) => entry.role === "server")?.db;
  const secondDb = secondStarts.find((entry) => entry.role === "server")?.db;
  assert.ok(firstDb);
  assert.ok(secondDb);
  assert.notEqual(dirname(firstDb), dirname(secondDb));

  first.child.kill("SIGTERM");
  second.child.kill("SIGTERM");
  const [firstResult, secondResult] = await Promise.all([
    first.completion,
    second.completion,
  ]);

  assert.equal(firstResult.code, 143, firstResult.output);
  assert.equal(secondResult.code, 143, secondResult.output);
  assert.deepEqual(readFileSync(sentinel), sentinelContents);
  assert.equal(existsSync(dirname(firstDb)), false);
  assert.equal(existsSync(dirname(secondDb)), false);
});

function createHarness(mode) {
  const root = mkdtempSync(join(tmpdir(), "dashclaw-launcher-test-"));
  const binDirectory = join(root, "bin");
  mkdirSync(binDirectory);
  writeFileSync(join(binDirectory, "mode"), mode);

  const fakeCorepack = join(binDirectory, "corepack");
  writeFileSync(
    fakeCorepack,
    `#!/usr/bin/env node
const { appendFileSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

const binDirectory = __dirname;
const mode = readFileSync(join(binDirectory, "mode"), "utf8");
const reportPath = join(binDirectory, "reports.jsonl");
const role = process.argv.includes("@dashclaw/server") ? "server" : "web";
const databasePath = process.env.DASHCLAW_DB || null;
const report = (event) => appendFileSync(
  reportPath,
  JSON.stringify({ event, role, db: databasePath, pid: process.pid }) + "\\n",
);

report("start");
if (role === "server" && databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  writeFileSync(databasePath, "owned database");
  writeFileSync(databasePath + "-wal", "owned wal");
  writeFileSync(databasePath + "-shm", "owned shm");
}

if (mode === "fail" && role === "server") {
  setTimeout(() => process.exit(23), 50);
}

process.on("SIGTERM", () => {
  report("sigterm");
  if (mode !== "stubborn") process.exit(0);
});
setInterval(() => {}, 60_000);
`,
  );
  chmodSync(fakeCorepack, 0o755);

  return {
    binDirectory,
    reportPath: join(binDirectory, "reports.jsonl"),
    root,
  };
}

function createSentinel(root) {
  const sentinel = join(root, "production.db");
  writeFileSync(sentinel, sentinelContents);
  return sentinel;
}

function launch(harness, sentinel) {
  const child = spawn(process.execPath, [launcherPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DASHCLAW_DB: sentinel,
      DASHCLAW_E2E_TOKEN: "playwright-launcher-test-token-not-a-secret",
      PATH: `${harness.binDirectory}${delimiter}${process.env.PATH ?? ""}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  return {
    child,
    completion: new Promise((resolve) => {
      child.on("close", (code, signal) => resolve({ code, output, signal }));
    }),
    getOutput: () => output,
  };
}

function registerCleanup(t, harness, launched) {
  t.after(() => {
    if (launched.child.exitCode === null && launched.child.signalCode === null) {
      for (const report of readReports(harness)) {
        try {
          process.kill(report.pid, "SIGKILL");
        } catch {
          // The fixture process has already exited.
        }
      }
      launched.child.kill("SIGKILL");
    }
    rmSync(harness.root, { force: true, recursive: true });
  });
}

async function waitForStarts(harness, count) {
  await waitFor(
    () => readReports(harness).filter((entry) => entry.event === "start").length >= count,
  );
  return readReports(harness).filter((entry) => entry.event === "start");
}

function readReports(harness) {
  if (!existsSync(harness.reportPath)) return [];
  const contents = readFileSync(harness.reportPath, "utf8").trim();
  if (!contents) return [];
  return contents.split("\n").map((line) => JSON.parse(line));
}

async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for launcher fixture");
}
