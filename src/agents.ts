import fs from "fs";
import path from "path";
import chalk from "chalk";
import {
  resolveEnv,
  resolveSkillPath,
  type GentConfig,
  type McpServerConfig,
} from "./config.js";
import { type Profile } from "./profiles.js";

export type AgentName = "claude" | "pi" | "codex";

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
  codexProfile?: string;
  approvalPolicy?: string;
  sandboxMode?: string;
  modelVerbosity?: string;
  personality?: string;
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

// A skill directory found on disk (one containing a SKILL.md at its root).
interface DiscoveredSkill {
  name: string; // directory basename — its folder name in the aggregated plugin
  dir: string; // absolute path to the skill directory
}

const SKILL_DISCOVERY_MAX_DEPTH = 8;
const SKILL_DISCOVERY_IGNORED = new Set([".git", "node_modules", "dist", ".cache"]);
const skillDiscoveryCache = new Map<string, DiscoveredSkill[]>();

// Recursively collect skill directories (those with a SKILL.md) under `root`. A
// directory with its own SKILL.md is a leaf skill — we don't descend into it.
// This handles a single skill (root/SKILL.md), a flat collection
// (root/skills/<skill>/SKILL.md), and categorized collections
// (root/skills/<category>/<skill>/SKILL.md) alike. statSync follows symlinks.
function collectSkillDirs(root: string, out: DiscoveredSkill[], depth = 0, seen = new Set<string>()): void {
  if (depth > SKILL_DISCOVERY_MAX_DEPTH) return;
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    return;
  }
  if (seen.has(realRoot)) return;
  seen.add(realRoot);

  if (fs.existsSync(path.join(root, "SKILL.md"))) {
    out.push({ name: path.basename(root), dir: root });
    return;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKILL_DISCOVERY_IGNORED.has(e.name)) continue;
    const p = path.join(root, e.name);
    let isDir = false;
    try {
      isDir = fs.statSync(p).isDirectory();
    } catch {
      isDir = false;
    }
    if (isDir) collectSkillDirs(p, out, depth + 1, seen);
  }
}

function discoverSkillDirs(root: string): DiscoveredSkill[] {
  const key = fs.existsSync(root) ? fs.realpathSync(root) : path.resolve(root);
  const cached = skillDiscoveryCache.get(key);
  if (cached) return cached;
  const found: DiscoveredSkill[] = [];
  collectSkillDirs(root, found);
  skillDiscoveryCache.set(key, found);
  return found;
}

// Split referenced skills into real plugins (shipping a .claude-plugin manifest,
// passed straight through so claude loads their skills/commands/agents itself)
// and loose skill directories. The latter are flattened — every SKILL.md found
// beneath them, at any depth — so categorized collections like mattpocock-skills
// (skills/<category>/<skill>/SKILL.md) resolve even though claude only discovers
// skills one level deep (skills/<name>/SKILL.md). Duplicate names are skipped.
function classifySkills(skills: string[]): {
  plugins: string[];
  aggregated: DiscoveredSkill[];
} {
  const plugins: string[] = [];
  const aggregated: DiscoveredSkill[] = [];
  const seen = new Set<string>();
  for (const name of skills) {
    const p = resolveSkillPath(name);
    if (fs.existsSync(path.join(p, ".claude-plugin", "plugin.json"))) {
      plugins.push(name);
      continue;
    }
    const found = discoverSkillDirs(p);
    if (found.length === 0) {
      console.warn(
        chalk.yellow(`Warning: skill "${name}" — no SKILL.md found under ${p}`)
      );
      continue;
    }
    for (const s of found) {
      if (seen.has(s.name)) {
        console.warn(
          chalk.yellow(`Warning: duplicate skill "${s.name}" — skipping ${s.dir}`)
        );
        continue;
      }
      seen.add(s.name);
      aggregated.push(s);
    }
  }
  return { plugins, aggregated };
}

// claude's --plugin-dir requires a .claude-plugin/plugin.json manifest. gent
// builds a temp plugin holding flat skill symlinks, so it writes a minimal one.
function writePluginManifest(pluginRoot: string): void {
  const dir = path.join(pluginRoot, ".claude-plugin");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "plugin.json"),
    JSON.stringify({
      name: "gent-skills",
      version: "0.0.0",
      description: "Skills aggregated by gent",
    }),
    "utf8"
  );
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

const CODEX_MODELS: WizardChoice[] = [
  { value: "", name: "Default (use codex's default)" },
  { value: "gpt-5.5", name: "GPT-5.5 — strongest for coding" },
  { value: "gpt-5.4-mini", name: "GPT-5.4 mini — faster / lower cost" },
  { value: "gpt-5.3-codex-spark", name: "GPT-5.3 Codex Spark — fastest iteration" },
  { value: "__custom__", name: "Custom model ID..." },
];

const CODEX_EFFORT: WizardChoice[] = [
  { value: "", name: "Default (use codex's default)" },
  { value: "minimal", name: "Minimal — fastest" },
  { value: "low", name: "Low" },
  { value: "medium", name: "Medium — balanced reasoning" },
  { value: "high", name: "High" },
  { value: "xhigh", name: "Extra high — maximum reasoning" },
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

    const { plugins, aggregated } = classifySkills(profile.skills ?? []);
    for (const name of plugins) {
      args.push("--plugin-dir", resolveSkillPath(name));
    }
    if (aggregated.length > 0) {
      if (tmpDir === null) {
        args.push(
          "--plugin-dir",
          `<tmp>/skills-plugin [${aggregated.map((s) => s.name).join(", ")}]`
        );
      } else {
        const pluginRoot = path.join(tmpDir, "skills-plugin");
        const pluginSkillsDir = path.join(pluginRoot, "skills");
        fs.mkdirSync(pluginSkillsDir, { recursive: true });
        writePluginManifest(pluginRoot);
        for (const s of aggregated) {
          fs.symlinkSync(s.dir, path.join(pluginSkillsDir, s.name));
        }
        args.push("--plugin-dir", pluginRoot);
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

    // pi loads each skill directory directly via --skill. It has no plugin
    // concept, so flatten everything (plugins included) down to skill dirs.
    const { plugins, aggregated } = classifySkills(profile.skills ?? []);
    for (const name of plugins) {
      const found = discoverSkillDirs(resolveSkillPath(name));
      for (const s of found) args.push("--skill", s.dir);
    }
    for (const s of aggregated) {
      args.push("--skill", s.dir);
    }

    return args;
  },
};

// ---------------------------------------------------------------------------
// Codex adapter — selects a Codex config profile and maps documented CLI flags
// ---------------------------------------------------------------------------

const CODEX_PROFILE_NAME = /^[a-zA-Z0-9_-]+$/;

function codexProfileName(profile: Profile): string {
  const configured = profile.settings?.codexProfile;
  return typeof configured === "string" && configured.trim()
    ? configured.trim()
    : profile.name;
}

function warnUnsupportedCodexFeature(message: string): void {
  console.warn(chalk.yellow(`Warning: ${message}`));
}

const codexAdapter: AgentAdapter = {
  name: "codex",
  binary: "codex",
  label: "codex",
  installHint: "Install it from: https://developers.openai.com/codex",
  wizardModels: CODEX_MODELS,
  wizardThinking: CODEX_EFFORT,
  thinkingPromptLabel: "Reasoning effort:",
  supportsMcp: false,
  buildArgs(profile, _globalConfig, _tmpDir) {
    const args: string[] = [];

    const profileName = codexProfileName(profile);
    if (CODEX_PROFILE_NAME.test(profileName)) {
      args.push("--profile", profileName);
    } else {
      warnUnsupportedCodexFeature(
        `codex --profile only accepts letters, numbers, hyphens, and underscores (ignored: ${profileName})`
      );
    }

    const model = profile.settings?.model;
    if (model) {
      args.push("--model", String(model));
    }

    const effort = profile.settings?.effortLevel;
    if (effort) {
      args.push("--config", `model_reasoning_effort="${String(effort)}"`);
    }

    const approvalPolicy = profile.settings?.approvalPolicy;
    if (approvalPolicy) {
      args.push("--ask-for-approval", String(approvalPolicy));
    }

    const sandboxMode = profile.settings?.sandboxMode;
    if (sandboxMode) {
      args.push("--sandbox", String(sandboxMode));
    }

    const verbosity = profile.settings?.modelVerbosity;
    if (verbosity) {
      args.push("--config", `model_verbosity="${String(verbosity)}"`);
    }

    const personality = profile.settings?.personality;
    if (personality) {
      args.push("--config", `personality="${String(personality)}"`);
    }

    if (profile.mcp && profile.mcp.length > 0) {
      warnUnsupportedCodexFeature(
        `gent MCP selections are not passed directly to codex (configure them in $CODEX_HOME/${profileName}.config.toml instead: ${profile.mcp.join(", ")})`
      );
    }
    if (profile.strict_mcp) {
      warnUnsupportedCodexFeature("strict_mcp is not supported by codex (ignored)");
    }
    if (profile.skills && profile.skills.length > 0) {
      warnUnsupportedCodexFeature(
        `gent skills are not passed directly to codex (install or expose Codex skills separately: ${profile.skills.join(", ")})`
      );
    }
    if (profile.system_prompt_append) {
      warnUnsupportedCodexFeature(
        "system_prompt_append is not passed directly to codex (use AGENTS.md, a Codex skill, or developer_instructions in the Codex profile)"
      );
    }

    for (const [key, value] of Object.entries(profile.settings ?? {})) {
      if (
        key === "model" ||
        key === "effortLevel" ||
        key === "codexProfile" ||
        key === "approvalPolicy" ||
        key === "sandboxMode" ||
        key === "modelVerbosity" ||
        key === "personality" ||
        value === undefined
      ) {
        continue;
      }
      warnUnsupportedCodexFeature(`settings.${key} is not supported by codex (ignored)`);
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
  codex: codexAdapter,
};

export const AGENT_NAMES = Object.keys(ADAPTERS) as AgentName[];

export function isAgentName(value: string): value is AgentName {
  return value in ADAPTERS;
}

export function getAdapter(name: AgentName = "claude"): AgentAdapter {
  return ADAPTERS[name];
}
