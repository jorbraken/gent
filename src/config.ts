import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
import chalk from "chalk";
import { gentConfigSchema, formatZodError } from "./schemas.js";

// The shared, user-level gent dir (~/.gent). In tests GENT_HOME redirects it.
function resolveGlobalDir(): string {
  if (process.env.NODE_ENV === "test" && process.env.GENT_HOME) {
    return path.join(process.env.GENT_HOME, ".gent");
  }
  return path.join(os.homedir(), ".gent");
}

// The active gent dir: the nearest project-local .gent/ walking up from cwd,
// falling back to the global ~/.gent. Writes always target this dir.
function resolveGentDir(): string {
  if (process.env.NODE_ENV === "test" && process.env.GENT_PROJECT) {
    return path.join(process.env.GENT_PROJECT, ".gent");
  }
  if (process.env.NODE_ENV === "test" && process.env.GENT_HOME) {
    return path.join(process.env.GENT_HOME, ".gent");
  }
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, ".gent");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolveGlobalDir();
}

export const GENT_DIR = resolveGentDir();
export const GLOBAL_GENT_DIR = resolveGlobalDir();
export const CONFIG_PATH = path.join(GENT_DIR, "config.yaml");
export const PROFILES_DIR = path.join(GENT_DIR, "profiles");
export const SKILLS_DIR = path.join(GENT_DIR, "skills");
export const SANDBOXES_DIR = path.join(GENT_DIR, "sandboxes");
export const RUNS_DIR = path.join(GENT_DIR, "runs");

// Expand a leading `~/` to the home directory. Kept local (not imported from
// profiles.ts) to avoid a config <-> profiles import cycle.
function expandHomePath(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Resolve an `extends` entry (a path to another .gent dir) to an absolute path.
// `~` is expanded, absolute paths are used as-is, and relative paths are
// resolved against the referencing .gent dir.
function resolveExtendPath(entry: string, baseGentDir: string): string {
  const expanded = expandHomePath(entry);
  return path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.resolve(baseGentDir, expanded);
}

// Ordered parent .gent dirs declared by a dir's config.yaml: explicit `extends`
// entries first (in order), then ~/.gent when `extend_global` is set. Raw read
// (not loadConfig) so chain building can't recurse through loadConfig. Returns
// resolved absolute paths.
export function parentDirs(gentDir: string): string[] {
  const cfgPath = path.join(gentDir, "config.yaml");
  if (!fs.existsSync(cfgPath)) return [];
  let raw: { extends?: string | string[]; extend_global?: boolean } | null;
  try {
    raw = yaml.load(fs.readFileSync(cfgPath, "utf8")) as typeof raw;
  } catch {
    return [];
  }
  if (!raw) return [];
  const parents: string[] = [];
  for (const entry of ([] as string[]).concat(raw.extends ?? [])) {
    if (typeof entry === "string" && entry.trim()) {
      parents.push(resolveExtendPath(entry.trim(), gentDir));
    }
  }
  if (raw.extend_global === true) parents.push(GLOBAL_GENT_DIR);
  return parents;
}

// Canonical key for cycle detection / de-duplication (resolves symlinks when
// the dir exists, otherwise normalizes the path).
function canonicalDir(dir: string): string {
  try {
    return fs.realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}

// Build the ordered lookup chain starting at `startDir`, following `extends`
// recursively. Depth-first preorder (self, then parents left-to-right) with
// first-occurrence-wins de-duplication. Throws on a circular extends; warns and
// skips parents that don't exist.
export function buildGentDirChain(startDir: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const stack: string[] = [];
  const stackKeys = new Set<string>();

  const visit = (dir: string): void => {
    const key = canonicalDir(dir);
    if (stackKeys.has(key)) {
      throw new Error(
        `Circular .gent extends: ${[...stack, dir].join(" -> ")}`
      );
    }
    if (seen.has(key)) return; // first occurrence wins
    seen.add(key);
    stack.push(dir);
    stackKeys.add(key);
    result.push(dir);
    for (const parent of parentDirs(dir)) {
      if (fs.existsSync(parent)) {
        visit(parent);
      } else {
        console.warn(
          chalk.yellow(`Warning: extends target "${parent}" does not exist — skipping`)
        );
      }
    }
    stack.pop();
    stackKeys.delete(key);
  };

  visit(startDir);
  return result;
}

// Lazily-built, memoized lookup chain for the active GENT_DIR. Lazy so the
// (potentially throwing) build runs inside a CLI action — caught by the
// top-level handler in cli.ts — rather than at module import.
let _chain: string[] | null = null;
export function gentDirChain(): string[] {
  return (_chain ??= buildGentDirChain(GENT_DIR));
}

// First existing match for a profile across the lookup chain (local wins).
export function resolveProfilePath(name: string): string | null {
  for (const dir of gentDirChain()) {
    const p = path.join(dir, "profiles", `${name}.yaml`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// First existing match for a sandbox across the lookup chain (local wins).
export function resolveSandboxPath(id: string): string | null {
  for (const dir of gentDirChain()) {
    const p = path.join(dir, "sandboxes", `${id}.yaml`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Resolve a skill directory across the chain; falls back to the local path so
// callers still get a sensible (if missing) path to report.
export function resolveSkillPath(name: string): string {
  for (const dir of gentDirChain()) {
    const p = path.join(dir, "skills", name);
    if (fs.existsSync(p)) return p;
  }
  return path.join(SKILLS_DIR, name);
}

// Human-friendly form of the active gent dir for messages: collapses the home
// directory to `~` and shows project-local dirs relative to cwd so the wizard
// never claims to use `~/.gent` when it's actually writing somewhere else.
export function displayGentDir(dir = GENT_DIR): string {
  const home = os.homedir();
  if (dir === path.join(home, ".gent")) return "~/.gent";
  const rel = path.relative(process.cwd(), dir);
  if (rel && !rel.startsWith("..")) return `./${rel}`;
  if (dir.startsWith(home + path.sep)) return `~${dir.slice(home.length)}`;
  return dir;
}

export interface McpServerConfig {
  type: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface GentConfig {
  mcp_servers: Record<string, McpServerConfig>;
  // Parent .gent directories to inherit profiles, skills, and MCP servers from.
  // Each entry is a path to another .gent dir (`~` expanded, relative paths
  // resolved against this .gent dir). Parents may themselves declare `extends`.
  extends?: string | string[];
  // Shorthand for adding ~/.gent as a parent (appended after `extends`).
  extend_global?: boolean;
}

const DEFAULT_CONFIG: GentConfig = {
  mcp_servers: {},
};

export function ensureGentDir(): void {
  fs.mkdirSync(GENT_DIR, { recursive: true });
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  fs.mkdirSync(SANDBOXES_DIR, { recursive: true });
}

export function listSkills(): string[] {
  const names = new Set<string>();
  for (const dir of gentDirChain()) {
    const skillsDir = path.join(dir, "skills");
    if (!fs.existsSync(skillsDir)) continue;
    for (const e of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (e.isDirectory()) names.add(e.name);
    }
  }
  return [...names].sort();
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_PATH);
}

function readConfigFile(cfgPath: string): GentConfig | null {
  const cached = configCache.get(cfgPath);
  if (cached !== undefined) return cached;
  if (!fs.existsSync(cfgPath)) return null;
  const raw = yaml.load(fs.readFileSync(cfgPath, "utf8"));
  const result = gentConfigSchema.safeParse(raw ?? {});
  if (!result.success) {
    throw new Error(`Invalid config at ${cfgPath}: ${formatZodError(result.error)}`);
  }
  configCache.set(cfgPath, result.data);
  return result.data;
}

const configCache = new Map<string, GentConfig>();

// The project-local config only — the file that writes target. Use this when
// adding/removing MCP servers so inherited (~/.gent) entries aren't copied in.
export function loadLocalConfig(): GentConfig {
  const raw = readConfigFile(CONFIG_PATH);
  if (!raw) return { ...DEFAULT_CONFIG };
  return { ...raw, mcp_servers: { ...(raw.mcp_servers ?? {}) } };
}

// The effective config used at runtime: inherited .gent dirs merged underneath
// the local config along the extends chain. Local servers win on name conflicts.
export function loadConfig(): GentConfig {
  const mcp_servers: Record<string, McpServerConfig> = {};
  // Walk farthest → nearest so nearer entries overwrite inherited ones.
  for (const dir of [...gentDirChain()].reverse()) {
    const raw = readConfigFile(path.join(dir, "config.yaml"));
    if (raw?.mcp_servers) Object.assign(mcp_servers, raw.mcp_servers);
  }
  return { mcp_servers };
}

export function saveConfig(config: GentConfig): void {
  ensureGentDir();
  fs.writeFileSync(CONFIG_PATH, yaml.dump(config), "utf8");
  configCache.delete(CONFIG_PATH);
}

export function interpolateEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] ?? "");
}

export function resolveEnv(
  env: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([k, v]) => [k, interpolateEnv(v)])
  );
}
