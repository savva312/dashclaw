import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

function findWorkspaceRoot(startDir: string): string {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return startDir;
    dir = parent;
  }
}

/** Load repo-root `.env` then `.env.local` (local overrides). Returns workspace root. */
export function loadEnv(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const root = findWorkspaceRoot(resolve(moduleDir, "../../.."));

  dotenv.config({ path: join(root, ".env") });
  dotenv.config({ path: join(root, ".env.local"), override: true });

  return root;
}
