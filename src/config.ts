import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";

const home =
  (process.env.NODE_ENV === "test" ? process.env.GENT_HOME : undefined) ??
  os.homedir();
export const GENT_DIR = path.join(home, ".gent");
export const CONFIG_PATH = path.join(GENT_DIR, "config.yaml");
export const PROFILES_DIR = path.join(GENT_DIR, "profiles");

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
}

const DEFAULT_CONFIG: GentConfig = {
  mcp_servers: {},
};

export function ensureGentDir(): void {
  fs.mkdirSync(GENT_DIR, { recursive: true });
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_PATH);
}

export function loadConfig(): GentConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return (yaml.load(raw) as GentConfig) ?? { ...DEFAULT_CONFIG };
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
