import fs from "fs";
import path from "path";
import chalk from "chalk";
import {
  resolveEnv,
  SKILLS_DIR,
  type GentConfig,
  type McpServerConfig,
} from "./config.js";
import { type Profile } from "./profiles.js";

export type AgentName = "claude" | "pi";

export interface WizardChoice {
  value: string;
  name: string;
}

export interface AgentAdapter {
  name: AgentName;
  /** Binary to spawn (resolved via PATH). */
  binary: string;
  /** Human-readable name used in error messages / dry-run echo. */
  label: string;
  /** Shown when the binary is missing from PATH. */
  installHint: string;
  /** Model choices offered by the interactive wizard. */
  wizardModels: WizardChoice[];
  /** Thinking/effort choices offered by the interactive wizard. */
  wizardThinking: WizardChoice[];
  /** Prompt label for the thinking/effort select in the wizard. */
  thinkingPromptLabel: string;
  /** Whether this agent understands MCP servers (wizard hides MCP prompts otherwise). */
  supportsMcp: boolean;
  /**
   * Build the full flag list for this agent.
   * When `tmpDir` is null (dry-run) sensitive values are inlined and no
   * filesystem writes happen; otherwise sensitive content is written to
   * 0o600 temp files / symlinks and file-based args are returned.
   */
  buildArgs(profile: Profile, globalConfig: GentConfig, tmpDir: string | null): string[];
}

// ---------------------------------------------------------------------------
// Shared helpers (used by the claude adapter; exported for reuse + tests)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Wizard choice lists
// ---------------------------------------------------------------------------

const CLAUDE_MODELS: WizardChoice[] = [
  { value: "", name: "Default (use claude's default)" },
  { value: "claude-fable-5", name: "Fable 5 — most capable" },
  { value: "claude-opus-4-8", name: "Opus 4.8 — most capable (Claude 4 family)" },
  { value: "claude-sonnet-4-6", name: "Sonnet 4.6 — balanced" },
  { value: "claude-haiku-4-5-20251001", name: "Haiku 4.5 — fastest / cheapest" },
  { value: "__custom__", name: "Custom model ID..." },
];

const CLAUDE_EFFORT: WizardChoice[] = [
  { value: "", name: "Default (use claude's default)" },
  { value: "low", name: "Low — minimal thinking, fastest" },
  { value: "medium", name: "Medium — balanced thinking" },
  { value: "high", name: "High — maximum thinking, slowest" },
];

const PI_MODELS: WizardChoice[] = [
  { value: "", name: "Default (use pi's default)" },
  { value: "anthropic/claude-sonnet-4-6", name: "Anthropic Sonnet 4.6 — balanced" },
  { value: "anthropic/claude-opus-4-8", name: "Anthropic Opus 4.8 — most capable" },
  { value: "openai/gpt-4o", name: "OpenAI GPT-4o" },
  { value: "google/gemini-2.5-pro", name: "Google Gemini 2.5 Pro" },
  { value: "__custom__", name: "Custom model pattern..." },
];

const PI_THINKING: WizardChoice[] = [
  { value: "", name: "Default (use pi's default)" },
  { value: "off", name: "Off — no thinking" },
  { value: "minimal", name: "Minimal" },
  { value: "low", name: "Low" },
  { value: "medium", name: "Medium" },
  { value: "high", name: "High" },
  { value: "xhigh", name: "Extra high — maximum thinking" },
];

// ---------------------------------------------------------------------------
// Claude adapter — the original gent behaviour
// ---------------------------------------------------------------------------

const claudeAdapter: AgentAdapter = {
  name: "claude",
  binary: "claude",
  label: "claude",
  installHint: "Install it from: https://claude.ai/code",
  wizardModels: CLAUDE_MODELS,
  wizardThinking: CLAUDE_EFFORT,
  thinkingPromptLabel: "Effort level:",
  supportsMcp: true,
  buildArgs(profile, globalConfig, tmpDir) {
    const args: string[] = [];

    const mcpConfig = buildMcpConfig(profile, globalConfig.mcp_servers);
    if (mcpConfig) {
      args.push("--mcp-config", emit(tmpDir, "mcp.json", JSON.stringify(mcpConfig)));
    }

    if (profile.strict_mcp && mcpConfig) {
      args.push("--strict-mcp-config");
    }

    const settings = buildSettings(profile);
    if (settings) {
      args.push("--settings", emit(tmpDir, "settings.json", JSON.stringify(settings)));
    }

    if (profile.system_prompt_append) {
      if (tmpDir === null) {
        args.push("--append-system-prompt", profile.system_prompt_append);
      } else {
        const file = path.join(tmpDir, "prompt.txt");
        fs.writeFileSync(file, profile.system_prompt_append, { mode: 0o600 });
        args.push("--append-system-prompt-file", file);
      }
    }

    const { bundles, individuals } = classifySkills(profile.skills ?? []);
    for (const name of bundles) {
      args.push("--plugin-dir", path.join(SKILLS_DIR, name));
    }
    if (individuals.length > 0) {
      if (tmpDir === null) {
        args.push("--plugin-dir", `<tmp>/skills-plugin [${individuals.join(", ")}]`);
      } else {
        const pluginSkillsDir = path.join(tmpDir, "skills-plugin", "skills");
        fs.mkdirSync(pluginSkillsDir, { recursive: true });
        for (const name of individuals) {
          fs.symlinkSync(path.join(SKILLS_DIR, name), path.join(pluginSkillsDir, name));
        }
        args.push("--plugin-dir", path.join(tmpDir, "skills-plugin"));
      }
    }

    return args;
  },
};

// Write `content` to a 0o600 temp file and return its path; in dry-run
// (tmpDir null) return the raw content so it shows inline in the echo.
function emit(tmpDir: string | null, filename: string, content: string): string {
  if (tmpDir === null) return content;
  const file = path.join(tmpDir, filename);
  fs.writeFileSync(file, content, { mode: 0o600 });
  return file;
}

// ---------------------------------------------------------------------------
// Pi adapter — translates the overlapping subset of profile features
// ---------------------------------------------------------------------------

const piAdapter: AgentAdapter = {
  name: "pi",
  binary: "pi",
  label: "pi",
  installHint: "Install it with: npm install -g @earendil-works/pi-coding-agent",
  wizardModels: PI_MODELS,
  wizardThinking: PI_THINKING,
  thinkingPromptLabel: "Thinking level:",
  supportsMcp: false,
  buildArgs(profile, _globalConfig, tmpDir) {
    const args: string[] = [];

    // Warn about features pi cannot represent.
    if (profile.mcp && profile.mcp.length > 0) {
      console.warn(
        chalk.yellow(
          `Warning: MCP servers are not supported by pi (ignored: ${profile.mcp.join(", ")})`
        )
      );
    }
    if (profile.strict_mcp) {
      console.warn(chalk.yellow("Warning: strict_mcp is not supported by pi (ignored)"));
    }

    const model = profile.settings?.model;
    if (model) {
      args.push("--model", model);
    }

    const thinking = profile.settings?.effortLevel;
    if (thinking) {
      args.push("--thinking", thinking);
    }

    for (const [key, value] of Object.entries(profile.settings ?? {})) {
      if (key === "model" || key === "effortLevel") continue;
      if (value === undefined) continue;
      console.warn(
        chalk.yellow(`Warning: settings.${key} is not supported by pi (ignored)`)
      );
    }

    if (profile.system_prompt_append) {
      if (tmpDir === null) {
        args.push("--append-system-prompt", profile.system_prompt_append);
      } else {
        const file = path.join(tmpDir, "prompt.txt");
        fs.writeFileSync(file, profile.system_prompt_append, { mode: 0o600 });
        args.push("--append-system-prompt", file);
      }
    }

    // pi loads a skill directory directly — no plugin aggregation needed.
    for (const name of profile.skills ?? []) {
      args.push("--skill", path.join(SKILLS_DIR, name));
    }

    return args;
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ADAPTERS: Record<AgentName, AgentAdapter> = {
  claude: claudeAdapter,
  pi: piAdapter,
};

export const AGENT_NAMES = Object.keys(ADAPTERS) as AgentName[];

export function isAgentName(value: string): value is AgentName {
  return value in ADAPTERS;
}

export function getAdapter(name: AgentName = "claude"): AgentAdapter {
  return ADAPTERS[name];
}
