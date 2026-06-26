import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";

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

// Read just the `extend_global` opt-in from a dir's config.yaml. Done with a
// raw read (not loadConfig) so chain resolution can't recurse into itself.
function readsExtendGlobal(dir: string): boolean {
  const cfgPath = path.join(dir, "config.yaml");
  if (!fs.existsSync(cfgPath)) return false;
  try {
    const raw = yaml.load(fs.readFileSync(cfgPath, "utf8")) as
      | { extend_global?: boolean }
      | null;
    return raw?.extend_global === true;
  } catch {
    return false;
  }
}

// Ordered dirs consulted for reads (profiles, skills, MCP servers): the local
// dir first, then ~/.gent when the local config opts in with `extend_global`.
function resolveChain(primary: string, global: string): string[] {
  if (primary === global) return [primary];
  if (readsExtendGlobal(primary) && fs.existsSync(global)) {
    return [primary, global];
  }
  return [primary];
}

export const GENT_DIR = resolveGentDir();
export const GLOBAL_GENT_DIR = resolveGlobalDir();
export const GENT_DIR_CHAIN = resolveChain(GENT_DIR, GLOBAL_GENT_DIR);
export const CONFIG_PATH = path.join(GENT_DIR, "config.yaml");
export const PROFILES_DIR = path.join(GENT_DIR, "profiles");
export const SKILLS_DIR = path.join(GENT_DIR, "skills");

// First existing match for a profile across the lookup chain (local wins).
export function resolveProfilePath(name: string): string | null {
  for (const dir of GENT_DIR_CHAIN) {
    const p = path.join(dir, "profiles", `${name}.yaml`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Resolve a skill directory across the chain; falls back to the local path so
// callers still get a sensible (if missing) path to report.
export function resolveSkillPath(name: string): string {
  for (const dir of GENT_DIR_CHAIN) {
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
  // When true on a project-local config, gent also reads profiles, skills, and
  // MCP servers from ~/.gent (local entries override on name conflicts).
  extend_global?: boolean;
}

const DEFAULT_CONFIG: GentConfig = {
  mcp_servers: {},
};

export function ensureGentDir(): void {
  fs.mkdirSync(GENT_DIR, { recursive: true });
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

export function listSkills(): string[] {
  const names = new Set<string>();
  for (const dir of GENT_DIR_CHAIN) {
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
  if (!fs.existsSync(cfgPath)) return null;
  return (yaml.load(fs.readFileSync(cfgPath, "utf8")) as GentConfig) ?? null;
}

// The project-local config only — the file that writes target. Use this when
// adding/removing MCP servers so inherited (~/.gent) entries aren't copied in.
export function loadLocalConfig(): GentConfig {
  const raw = readConfigFile(CONFIG_PATH);
  if (!raw) return { ...DEFAULT_CONFIG };
  return { ...raw, mcp_servers: { ...(raw.mcp_servers ?? {}) } };
}

// The effective config used at runtime: ~/.gent merged underneath the local
// config when `extend_global` is set. Local servers win on name conflicts.
export function loadConfig(): GentConfig {
  const mcp_servers: Record<string, McpServerConfig> = {};
  // Walk global → local so local entries overwrite inherited ones.
  for (const dir of [...GENT_DIR_CHAIN].reverse()) {
    const raw = readConfigFile(path.join(dir, "config.yaml"));
    if (raw?.mcp_servers) Object.assign(mcp_servers, raw.mcp_servers);
  }
  return { mcp_servers };
}

export function saveConfig(config: GentConfig): void {
  ensureGentDir();
  fs.writeFileSync(CONFIG_PATH, yaml.dump(config), "utf8");
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
