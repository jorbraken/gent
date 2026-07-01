import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { openDatabase } from "../db/connection.js";
import { migrateGlobalDb } from "../db/migrations/global.js";
import { migrateProjectDb } from "../db/migrations/project.js";
import { ProjectRegistryRepository } from "../db/repositories/projectRegistryRepository.js";
import { resolveProject } from "../core/projectResolver.js";
import { OpsysError } from "../core/errors.js";

// ~/.opsys/projects.db. In tests OPSYS_HOME redirects it, mirroring GENT_HOME in config.ts.
export function opsysHome(): string {
  if (process.env.NODE_ENV === "test" && process.env.OPSYS_HOME) {
    return process.env.OPSYS_HOME;
  }
  return homedir();
}

export interface GlobalRegistryOptions {
  yes?: boolean;
  confirmCreateGlobalDb?: () => Promise<boolean>;
  isInteractive?: boolean;
}

async function ensureGlobalDb(globalDbPath: string, options: GlobalRegistryOptions): Promise<void> {
  if (existsSync(globalDbPath) || options.yes) return;
  if (!options.isInteractive || !options.confirmCreateGlobalDb) {
    throw new OpsysError("Global registry does not exist; rerun with --yes to create ~/.opsys/projects.db");
  }
  const confirmed = await options.confirmCreateGlobalDb();
  if (!confirmed) throw new OpsysError("Global registry creation declined");
}

// Open the global project registry, running the pending-creation confirmation flow first.
export async function withRegistry<T>(
  options: GlobalRegistryOptions,
  callback: (registry: ProjectRegistryRepository) => T | Promise<T>
): Promise<T> {
  const globalDbPath = join(opsysHome(), ".opsys", "projects.db");
  await ensureGlobalDb(globalDbPath, options);
  const globalDb = openDatabase(globalDbPath);
  migrateGlobalDb(globalDb);
  try {
    return await callback(new ProjectRegistryRepository(globalDb));
  } finally {
    globalDb.close();
  }
}

// Resolve the active project (by --project or cwd) and open its project-local database.
export async function withProjectDb<T>(
  projectRef: string | undefined,
  options: GlobalRegistryOptions,
  callback: (projectDb: Database.Database) => T | Promise<T>
): Promise<T> {
  return withRegistry(options, async (registry) => {
    const project = resolveProject({ registry, cwd: process.cwd(), projectRef });
    if (!existsSync(project.dbPath)) {
      throw new OpsysError(`Registered project database is missing: ${project.dbPath}`);
    }
    const projectDb = openDatabase(project.dbPath);
    migrateProjectDb(projectDb);
    try {
      return await callback(projectDb);
    } finally {
      projectDb.close();
    }
  });
}

export function parseId(value: string | undefined, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new OpsysError(`${label} must be a positive integer`);
  return id;
}

// Standard GlobalRegistryOptions for a CLI action: --yes bypasses the prompt,
// otherwise prompt interactively when attached to a TTY.
export function globalRegistryOptions(yes?: boolean): GlobalRegistryOptions {
  return {
    yes,
    isInteractive: process.stdin.isTTY === true,
    confirmCreateGlobalDb: async () => {
      const { confirm } = await import("@inquirer/prompts");
      return confirm({
        message: "Global opsys registry (~/.opsys/projects.db) doesn't exist yet. Create it?",
        default: true,
      });
    },
  };
}
