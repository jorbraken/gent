import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import {
  SANDBOXES_DIR,
  RUNS_DIR,
  gentDirChain,
  resolveSandboxPath,
  ensureGentDir,
} from "./config.js";
import { sandboxSchema, formatZodError } from "./schemas.js";

export type SandboxDriverName = "local" | "apple-container";
export type SandboxLifecycle = "ephemeral" | "persistent";
export type MountMode = "ro" | "rw";
export type NetworkMode = "none" | "full";

export interface SandboxMount {
  source: string;
  target: string;
  mode: MountMode;
}

export interface Sandbox {
  id: string;
  name?: string;
  driver: SandboxDriverName;
  image?: string;
  workdir?: string;
  lifecycle?: SandboxLifecycle;
  mounts?: SandboxMount[];
  environment?: Record<string, string>;
  network?: NetworkMode;
}

const VALID_NAME = /^[a-zA-Z0-9_-]+$/;
const sandboxCache = new Map<string, Sandbox>();

export function validateSandboxName(id: string): void {
  if (!VALID_NAME.test(id)) {
    throw new Error(
      `Invalid sandbox name "${id}". Only letters, numbers, hyphens, and underscores are allowed.`
    );
  }
}

// Write path for a sandbox — always the project-local sandboxes dir.
export function sandboxPath(id: string): string {
  validateSandboxName(id);
  return path.join(SANDBOXES_DIR, `${id}.yaml`);
}

export function sandboxExists(id: string): boolean {
  validateSandboxName(id);
  return resolveSandboxPath(id) !== null;
}

export function loadSandbox(id: string): Sandbox {
  validateSandboxName(id);
  const p = resolveSandboxPath(id);
  if (!p) {
    throw new Error(
      `Sandbox "${id}" not found in ${gentDirChain().join(", ")}`
    );
  }
  const cached = sandboxCache.get(p);
  if (cached) return cached;
  const parsed = sandboxSchema.safeParse(yaml.load(fs.readFileSync(p, "utf8")) ?? {});
  if (!parsed.success) {
    throw new Error(`Invalid sandbox at ${p}: ${formatZodError(parsed.error)}`);
  }
  const sandbox = parsed.data as Sandbox;
  sandbox.id = id; // filename is always authoritative
  sandboxCache.set(p, sandbox);
  return sandbox;
}

export function saveSandbox(sandbox: Sandbox): void {
  const parsed = sandboxSchema.safeParse(sandbox);
  if (!parsed.success) {
    throw new Error(`Invalid sandbox "${sandbox.id}": ${formatZodError(parsed.error)}`);
  }
  ensureGentDir();
  const p = sandboxPath(sandbox.id);
  fs.writeFileSync(p, yaml.dump(sandbox), "utf8");
  sandboxCache.delete(p);
}

export function listSandboxes(): Sandbox[] {
  const seen = new Set<string>();
  const sandboxes: Sandbox[] = [];
  // Local first so a local sandbox shadows a global one of the same name.
  for (const dir of gentDirChain()) {
    const dirPath = path.join(dir, "sandboxes");
    if (!fs.existsSync(dirPath)) continue;
    for (const f of fs.readdirSync(dirPath)) {
      if (!f.endsWith(".yaml")) continue;
      const id = f.replace(/\.yaml$/, "");
      if (seen.has(id)) continue;
      seen.add(id);
      sandboxes.push(loadSandbox(id));
    }
  }
  return sandboxes;
}

// Directory holding the runner's per-sandbox artifacts (MCP config, settings,
// system-prompt, aggregated skills plugin) — bind-mounted into isolated
// drivers at the same host path so buildArgs()'s file paths work unmodified
// inside the container. Stable per sandbox id so a persistent sandbox's
// container (mounted once at creation) keeps seeing fresh content on every
// run; ephemeral sandboxes clean this up after each run.
export function sandboxRunsDir(id: string): string {
  return path.join(RUNS_DIR, id);
}

export function ensureSandboxRunsDir(id: string): string {
  const dir = sandboxRunsDir(id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}
