#!/usr/bin/env node
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = await mkdtemp(join(tmpdir(), "dashclaw-sec-001-"));
const sentinelEnvironment = {
  DASHCLAW_TOKEN: "sec-001-server-token-sentinel-not-a-secret",
  VITE_DASHCLAW_TOKEN: "sec-001-browser-token-sentinel-not-a-secret",
};
const originalEnvironment = new Map(
  Object.keys(sentinelEnvironment).map((name) => [name, process.env[name]]),
);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return files.flat();
}

try {
  Object.assign(process.env, sentinelEnvironment);

  await build({
    root: packageRoot,
    configFile: resolve(packageRoot, "vite.config.ts"),
    mode: "production",
    logLevel: "silent",
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: true,
    },
  });

  const files = await listFiles(outDir);
  const forbiddenValues = [
    ...Object.keys(sentinelEnvironment),
    ...Object.values(sentinelEnvironment),
  ];
  const matches = [];

  for (const file of files) {
    const path = relative(outDir, file);
    const contents = await readFile(file, "utf8");
    for (const value of forbiddenValues) {
      if (path.includes(value) || contents.includes(value)) {
        matches.push(`${path}: ${value}`);
      }
    }
  }

  if (matches.length > 0) {
    throw new Error(`SEC-001 browser bundle scan found forbidden token data:\n${matches.join("\n")}`);
  }

  console.log(
    `SEC-001 browser bundle scan passed: ${files.length} files, ${forbiddenValues.length} forbidden values, 0 matches`,
  );
} finally {
  for (const [name, value] of originalEnvironment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(outDir, { recursive: true, force: true });
}
