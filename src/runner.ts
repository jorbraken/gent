import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import chalk from "chalk";
import { loadConfig, resolveEnv, SKILLS_DIR, type McpServerConfig } from "./config.js";
import { type Profile } from "./profiles.js";

export interface McpConfigJson {
  mcpServers: Record<string, McpServerConfig>;
}

interface SettingsJson {
  model?: string;
  permissionMode?: string;
  effortLevel?: string;
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
  return Object.keys(settings).length > 0 ? settings : null;
}

// Skills with a `skills/` subdirectory are plugin-style bundles (passed as --plugin-dir).
// Skills with a SKILL.md directly are individual skills, aggregated into a temp plugin.
function classifySkills(skills: string[]): {
  bundles: string[];
  individuals: string[];
} {
  const bundles: string[] = [];
  const individuals: string[] = [];
  for (const name of skills) {
    const p = path.join(SKILLS_DIR, name);
    if (fs.existsSync(path.join(p, "skills"))) {
      bundles.push(name);
    } else {
      individuals.push(name);
    }
  }
  return { bundles, individuals };
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

  const { bundles, individuals } = classifySkills(profile.skills ?? []);

  // Bundle-style skills are passed directly as --plugin-dir
  for (const name of bundles) {
    claudeArgs.push("--plugin-dir", path.join(SKILLS_DIR, name));
  }

  if (dryRun) {
    if (individuals.length > 0) {
      // Show individual skills as a descriptive placeholder
      claudeArgs.push("--plugin-dir", `<tmp>/skills-plugin [${individuals.join(", ")}]`);
    }
    console.log(chalk.cyan("claude") + " " + claudeArgs.join(" "));
    return;
  }

  // Write sensitive args to temp files (mode 0o600) so they aren't visible in `ps`
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gent-"));

  // Individual skills: aggregate into a temp plugin with a skills/ subdir
  if (individuals.length > 0) {
    const pluginSkillsDir = path.join(tmpDir, "skills-plugin", "skills");
    fs.mkdirSync(pluginSkillsDir, { recursive: true });
    for (const name of individuals) {
      fs.symlinkSync(path.join(SKILLS_DIR, name), path.join(pluginSkillsDir, name));
    }
    claudeArgs.push("--plugin-dir", path.join(tmpDir, "skills-plugin"));
  }

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
