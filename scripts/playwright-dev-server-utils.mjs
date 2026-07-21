import {
  existsSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

const CHILD_ENV_ALLOWLIST = [
  "APPDATA",
  "CI",
  "COLORTERM",
  "ComSpec",
  "COREPACK_HOME",
  "DASHCLAW_PORT",
  "FORCE_COLOR",
  "HOME",
  "LANG",
  "LC_ALL",
  "LOCALAPPDATA",
  "LOGNAME",
  "NODE_OPTIONS",
  "NO_COLOR",
  "PATH",
  "PATHEXT",
  "PNPM_HOME",
  "SHELL",
  "SystemRoot",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USER",
  "VITE_DASHCLAW_API_URL",
  "VITE_PORT",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
];

export function createOwnedDatabase() {
  const directory = mkdtempSync(
    join(realpathSync(tmpdir()), "dashclaw-playwright-"),
  );
  const canonicalDirectory = realpathSync(directory);
  const identity = lstatSync(directory, { bigint: true });
  const databasePath = join(directory, "dashclaw.db");

  return Object.freeze({
    canonicalDirectory,
    databasePath,
    device: identity.dev,
    directory,
    inode: identity.ino,
  });
}

export function buildChildEnvironment(overrides = {}, source = process.env) {
  const environment = {};

  for (const name of CHILD_ENV_ALLOWLIST) {
    if (source[name] !== undefined) {
      environment[name] = source[name];
    }
  }

  return { ...environment, ...overrides };
}

export function isPathInsideOwnedDirectory(owned, candidate) {
  try {
    if (!isStrictDescendant(owned.directory, candidate)) return false;
    return isStrictDescendant(
      owned.canonicalDirectory,
      canonicalizePath(candidate),
    );
  } catch {
    return false;
  }
}

export function cleanupOwnedDatabase(owned) {
  const currentIdentity = lstatSync(owned.directory, { bigint: true });
  if (
    !currentIdentity.isDirectory()
    || currentIdentity.dev !== owned.device
    || currentIdentity.ino !== owned.inode
    || realpathSync(owned.directory) !== owned.canonicalDirectory
  ) {
    throw new Error(
      `refusing cleanup because the owned directory identity changed: ${owned.directory}`,
    );
  }

  const databaseCandidates = [
    owned.databasePath,
    `${owned.databasePath}-wal`,
    `${owned.databasePath}-shm`,
  ];
  for (const candidate of databaseCandidates) {
    if (!isPathInsideOwnedDirectory(owned, candidate)) {
      throw new Error(
        `refusing cleanup because a database path escapes the owned directory: ${candidate}`,
      );
    }
  }

  rmSync(owned.directory, { force: true, recursive: true });
}

function isStrictDescendant(parent, candidate) {
  const pathFromParent = relative(resolve(parent), resolve(candidate));
  return (
    pathFromParent !== ""
    && pathFromParent !== ".."
    && !pathFromParent.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    && !isAbsolute(pathFromParent)
  );
}

function canonicalizePath(candidate) {
  let existingPath = resolve(candidate);
  const missingSegments = [];

  while (!existsSync(existingPath)) {
    const parent = dirname(existingPath);
    if (parent === existingPath) {
      throw new Error(`cannot canonicalize path: ${candidate}`);
    }
    missingSegments.unshift(basename(existingPath));
    existingPath = parent;
  }

  return resolve(realpathSync(existingPath), ...missingSegments);
}
