import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import chalk from "chalk";
import { loadConfig, resolveEnv, type McpServerConfig } from "./config.js";
import { expandHome, type Profile } from "./profiles.js";

export interface McpConfigJson {
  mcpServers: Record<string, McpServerConfig>;
}

interface SettingsJson {
  model?: string;
  permissionMode?: string;
  effortLevel?: string;
  skillsDirectories?: string[];
  [key: string]: unknown;
}

export function buildMcpConfig(
  profile: Profile,
  serverRegistry: Record<string, McpServerConfig>
): McpConfigJson | null {
  if (!profile.mcp || profile.mcp.length === 0) return null;

  const servers: Record<string, McpServerConfig> = {};
  for (const name of profile.mcp) {
    const def = serverRegistry[name];
    if (!def) {
      console.warn(
        chalk.yellow(`Warning: MCP server "${name}" not found in config`)
      );
      continue;
    }
    servers[name] = {
      ...def,
      env: def.env ? resolveEnv(def.env) : undefined,
    };
  }

  return Object.keys(servers).length > 0 ? { mcpServers: servers } : null;
}

export function buildSettings(profile: Profile): SettingsJson | null {
  const settings: SettingsJson = { ...(profile.settings ?? {}) };

  if (profile.skills && profile.skills.length > 0) {
    settings.skillsDirectories = profile.skills.map(expandHome);
  }

  return Object.keys(settings).length > 0 ? settings : null;
}

export function run(profile: Profile, extraArgs: string[], dryRun = false): void {
  const globalConfig = loadConfig();

  const claudeArgs: string[] = [];

  const mcpConfig = buildMcpConfig(profile, globalConfig.mcp_servers);
  if (mcpConfig) {
    claudeArgs.push("--mcp-config", JSON.stringify(mcpConfig));
  }

  if (profile.strict_mcp && mcpConfig) {
    claudeArgs.push("--strict-mcp-config");
  }

  const settings = buildSettings(profile);
  if (settings) {
    claudeArgs.push("--settings", JSON.stringify(settings));
  }

  if (profile.system_prompt_append) {
    claudeArgs.push("--append-system-prompt", profile.system_prompt_append);
  }

  claudeArgs.push(...extraArgs);

  if (dryRun) {
    console.log(chalk.cyan("claude") + " " + claudeArgs.join(" "));
    return;
  }

  // Write sensitive args to temp files (mode 0o600) so they aren't visible in `ps`
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gent-"));
  const safeArgs: string[] = [];
  let i = 0;
  while (i < claudeArgs.length) {
    const arg = claudeArgs[i];
    if (arg === "--mcp-config" || arg === "--settings") {
      const filename = arg === "--mcp-config" ? "mcp.json" : "settings.json";
      const file = path.join(tmpDir, filename);
      fs.writeFileSync(file, claudeArgs[i + 1], { mode: 0o600 });
      safeArgs.push(arg, file);
      i += 2;
    } else if (arg === "--append-system-prompt") {
      const file = path.join(tmpDir, "prompt.txt");
      fs.writeFileSync(file, claudeArgs[i + 1], { mode: 0o600 });
      safeArgs.push("--append-system-prompt-file", file);
      i += 2;
    } else {
      safeArgs.push(arg);
      i++;
    }
  }

  try {
    const result = spawnSync("claude", safeArgs, { stdio: "inherit" });
    if (result.error) {
      if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
        console.error(chalk.red("claude is not installed or not in PATH."));
        console.error(chalk.gray("Install it from: https://claude.ai/code"));
      } else {
        console.error(chalk.red(`Failed to launch claude: ${result.error.message}`));
      }
      process.exit(1);
    }
    process.exit(result.status ?? 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
