import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  type Stats,
} from "node:fs";
import { basename, dirname, parse, resolve } from "node:path";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const PERMISSION_BITS = 0o7777;
const STICKY_BIT = 0o1000;

export type UnsupportedPermissionPolicy = "error" | "warn";

export interface RuntimeDataSecurityOptions {
  unsupportedPermissionPolicy?: UnsupportedPermissionPolicy;
  onWarning?: (message: string) => void;
}

export interface PreparedRuntimeData {
  dbPath: string;
  enforcePosixPermissions: boolean;
}

export function prepareRuntimeData(
  dbPath: string,
  options: RuntimeDataSecurityOptions = {},
): PreparedRuntimeData {
  if (dbPath === ":memory:") {
    return { dbPath, enforcePosixPermissions: false };
  }
  if (dbPath.trim() === "") {
    throw new Error("Dashclaw database path must not be empty");
  }

  const absoluteDbPath = resolve(dbPath);
  const enforcePosixPermissions = process.platform !== "win32";
  if (!enforcePosixPermissions) {
    const message =
      "POSIX owner-only permissions cannot be enforced on Windows; " +
      "use a loopback-only deployment and restrict the data directory with Windows ACLs";
    if ((options.unsupportedPermissionPolicy ?? "error") === "error") {
      throw new Error(message);
    }
    (options.onWarning ?? console.warn)(`[dashclaw] WARNING: ${message}`);
  }

  ensureDataDirectory(absoluteDbPath, enforcePosixPermissions);
  ensureDatabaseFile(absoluteDbPath, enforcePosixPermissions, true);
  for (const suffix of ["-wal", "-shm"]) {
    ensureDatabaseFile(`${absoluteDbPath}${suffix}`, enforcePosixPermissions, false);
  }

  return { dbPath: absoluteDbPath, enforcePosixPermissions };
}

export function secureRuntimeDatabaseFiles(prepared: PreparedRuntimeData): void {
  if (prepared.dbPath === ":memory:") return;

  ensureDatabaseFile(prepared.dbPath, prepared.enforcePosixPermissions, false);
  for (const suffix of ["-wal", "-shm"]) {
    ensureDatabaseFile(
      `${prepared.dbPath}${suffix}`,
      prepared.enforcePosixPermissions,
      false,
    );
  }
}

function ensureDataDirectory(dbPath: string, enforcePosixPermissions: boolean): void {
  const directoryPath = dirname(dbPath);
  let stats = lstatSync(directoryPath, { throwIfNoEntry: false });
  if (!stats) {
    mkdirSync(directoryPath, { recursive: true, mode: DIRECTORY_MODE });
    stats = lstatSync(directoryPath);
  }

  if (stats.isSymbolicLink()) {
    throw new Error("Dashclaw database parent directory must not be a symbolic link");
  }
  if (!stats.isDirectory()) {
    throw new Error("Dashclaw database parent path must be a directory");
  }
  if (!enforcePosixPermissions) return;

  if (resolve(directoryPath) === parse(resolve(directoryPath)).root) {
    throw new Error("Dashclaw database must be stored in a dedicated data directory");
  }
  if ((stats.mode & STICKY_BIT) !== 0) {
    throw new Error(
      "Dashclaw database must not be stored directly in a shared sticky directory; " +
        "use a dedicated data subdirectory",
    );
  }

  assertOwnedByCurrentUser(stats, "database parent directory");
  if ((stats.mode & PERMISSION_BITS) !== DIRECTORY_MODE) {
    assertDedicatedDataDirectory(directoryPath, dbPath);
  }
  enforceMode(directoryPath, DIRECTORY_MODE, "database parent directory", stats);
}

function assertDedicatedDataDirectory(directoryPath: string, dbPath: string): void {
  const dbName = basename(dbPath);
  const allowedEntries = new Set([dbName, `${dbName}-wal`, `${dbName}-shm`]);
  const unrelatedEntry = readdirSync(directoryPath).find((entry) => !allowedEntries.has(entry));
  if (unrelatedEntry) {
    throw new Error(
      "Dashclaw will not change permissions on a non-dedicated database directory; " +
        "use a dedicated data directory",
    );
  }
}

function ensureDatabaseFile(
  filePath: string,
  enforcePosixPermissions: boolean,
  createIfMissing: boolean,
): void {
  let stats = lstatSync(filePath, { throwIfNoEntry: false });
  if (!stats && createIfMissing) {
    try {
      const fd = openSync(
        filePath,
        constants.O_CREAT | constants.O_EXCL | constants.O_RDWR,
        FILE_MODE,
      );
      closeSync(fd);
    } catch (error) {
      if (!isAlreadyExistsError(error)) throw error;
    }
    stats = lstatSync(filePath, { throwIfNoEntry: false });
  }
  if (!stats) return;

  if (stats.isSymbolicLink()) {
    throw new Error("Dashclaw database and sidecar targets must not be symbolic links");
  }
  if (!stats.isFile()) {
    throw new Error("Dashclaw database and sidecar targets must be regular files");
  }
  if (!enforcePosixPermissions) return;

  assertOwnedByCurrentUser(stats, "database or sidecar file");
  enforceMode(filePath, FILE_MODE, "database or sidecar file", stats);
}

function assertOwnedByCurrentUser(stats: Stats, target: string): void {
  if (typeof process.getuid !== "function") {
    throw new Error(`Cannot verify ownership of Dashclaw ${target} on this platform`);
  }
  if (stats.uid !== process.getuid()) {
    throw new Error(`Dashclaw ${target} must be owned by the current user`);
  }
}

function enforceMode(
  filePath: string,
  expectedMode: number,
  target: string,
  expectedStats: Stats,
): void {
  let fd: number | undefined;
  try {
    fd = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const openedStats = fstatSync(fd);
    if (openedStats.dev !== expectedStats.dev || openedStats.ino !== expectedStats.ino) {
      throw new Error("path identity changed before permissions were enforced");
    }
    fchmodSync(fd, expectedMode);
    if ((fstatSync(fd).mode & PERMISSION_BITS) !== expectedMode) {
      throw new Error("owner-only mode was not applied");
    }
  } catch (cause) {
    throw new Error(`Could not enforce owner-only permissions on Dashclaw ${target}`, {
      cause,
    });
  } finally {
    if (fd !== undefined) closeSync(fd);
  }

  const stats = lstatSync(filePath);
  if (
    stats.isSymbolicLink() ||
    stats.dev !== expectedStats.dev ||
    stats.ino !== expectedStats.ino ||
    (stats.mode & PERMISSION_BITS) !== expectedMode
  ) {
    throw new Error(`Could not enforce owner-only permissions on Dashclaw ${target}`);
  }
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}
