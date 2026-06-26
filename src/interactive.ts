import { confirm, input, select } from "@inquirer/prompts";
import chalk from "chalk";
import { listProfiles, mergeProfiles, type Profile } from "./profiles.js";

export async function pickProfile(): Promise<Profile> {
  const profiles = listProfiles();

  if (profiles.length === 0) {
    console.log(
      chalk.yellow("No profiles found. Run `gent init` to get started.")
    );
    process.exit(0);
  }

  const { checkbox } = await import("@inquirer/prompts");

  const selectedNames = await checkbox({
    message: "Select profiles to activate (space to toggle, enter to confirm):",
    choices: profiles.map((p) => ({
      name: p.name + (p.description ? chalk.gray(` — ${p.description}`) : ""),
      value: p.name,
    })),
    validate: (choices) =>
      choices.length > 0 || "Select at least one profile",
  });

  const selectedProfiles = selectedNames.map(
    (n) => profiles.find((p) => p.name === n)!
  );
  const merged =
    selectedProfiles.length === 1
      ? selectedProfiles[0]
      : mergeProfiles(selectedProfiles);

  return customizeProfile(merged);
}

async function customizeProfile(profile: Profile): Promise<Profile> {
  const { checkbox } = await import("@inquirer/prompts");

  let mcp = profile.mcp;
  if (mcp && mcp.length > 0) {
    const selected = await checkbox({
      message: "MCP servers to load (deselect any to exclude for this session):",
      choices: mcp.map((s) => ({ name: s, value: s, checked: true })),
    });
    mcp = selected.length > 0 ? selected : [];
  }

  let skills = profile.skills;
  if (skills && skills.length > 0) {
    const selected = await checkbox({
      message: "Skills to load (deselect any to exclude for this session):",
      choices: skills.map((s) => ({ name: s, value: s, checked: true })),
    });
    skills = selected.length > 0 ? selected : [];
  }

  return {
    ...profile,
    ...(mcp !== undefined ? { mcp } : {}),
    ...(skills !== undefined ? { skills } : {}),
  };
}

export async function initWizard(): Promise<void> {
  console.log(chalk.bold("\nWelcome to gent!\n"));
  console.log(
    "This wizard will set up your ~/.gent directory with an initial config.\n"
  );

  const { saveConfig, loadConfig, ensureGentDir, configExists } = await import(
    "./config.js"
  );
  const { saveProfile, profileExists } = await import("./profiles.js");

  ensureGentDir();

  if (configExists()) {
    const overwrite = await confirm({
      message:
        "~/.gent/config.yaml already exists. Continue and add to it?",
      default: true,
    });
    if (!overwrite) return;
  }

  const config = loadConfig();

  const addMcp = await confirm({
    message: "Add an MCP server now?",
    default: false,
  });

  if (addMcp) {
    await addMcpServerWizard(config.mcp_servers);
    saveConfig(config);
  }

  const createProfile = await confirm({
    message: "Create your first profile?",
    default: true,
  });

  if (createProfile) {
    const profile = await profileWizard(config.mcp_servers);
    saveProfile(profile);
    console.log(
      chalk.green(`\nProfile "${profile.name}" created! Run: gent ${profile.name}`)
    );
  } else {
    console.log(
      chalk.green("\nDone! Use `gent profile create <name>` to add profiles.")
    );
  }
}

export async function addMcpServerWizard(
  registry: Record<string, unknown>
): Promise<void> {
  const { saveConfig, loadConfig } = await import("./config.js");

  const name = await input({ message: "Server name (e.g. github):" });
  const type = await select({
    message: "Type:",
    choices: [
      { name: "stdio (local process)", value: "stdio" },
      { name: "http (remote HTTP endpoint)", value: "http" },
      { name: "sse (Server-Sent Events)", value: "sse" },
    ],
  });

  if (type === "stdio") {
    const command = await input({ message: "Command (e.g. npx):" });
    const argsRaw = await input({
      message: "Args (comma-separated, e.g. -y,@modelcontextprotocol/server-github):",
    });
    const args = argsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const envRaw = await input({
      message:
        "Env vars (KEY=VALUE pairs, comma-separated, use ${VAR} for env refs):",
    });
    const env: Record<string, string> = {};
    if (envRaw.trim()) {
      for (const pair of envRaw.split(",")) {
        const [k, ...rest] = pair.trim().split("=");
        if (k) env[k.trim()] = rest.join("=").trim();
      }
    }

    const config = loadConfig();
    config.mcp_servers[name] = { type: "stdio", command, args, ...(Object.keys(env).length ? { env } : {}) };
    saveConfig(config);
  } else {
    const url = await input({ message: "URL:" });
    const config = loadConfig();
    config.mcp_servers[name] = { type: type as "http" | "sse", url };
    saveConfig(config);
  }

  console.log(chalk.green(`MCP server "${name}" added.`));
}

const EFFORT_LEVELS = [
  { value: "", name: "Default (use claude's default)" },
  { value: "low", name: "Low — minimal thinking, fastest" },
  { value: "medium", name: "Medium — balanced thinking" },
  { value: "high", name: "High — maximum thinking, slowest" },
];

const CLAUDE_MODELS = [
  { value: "", name: "Default (use claude's default)" },
  { value: "claude-fable-5", name: "Fable 5 — most capable" },
  { value: "claude-opus-4-8", name: "Opus 4.8 — most capable (Claude 4 family)" },
  { value: "claude-sonnet-4-6", name: "Sonnet 4.6 — balanced" },
  { value: "claude-haiku-4-5-20251001", name: "Haiku 4.5 — fastest / cheapest" },
  { value: "__custom__", name: "Custom model ID..." },
];

export async function profileWizard(
  mcpRegistry: Record<string, unknown>
): Promise<Profile> {
  const name = await input({ message: "Profile name (e.g. product):" });
  const description = await input({
    message: "Description (optional):",
  });

  const serverNames = Object.keys(mcpRegistry);
  let mcp: string[] = [];
  if (serverNames.length > 0) {
    const { checkbox } = await import("@inquirer/prompts");
    mcp = await checkbox({
      message: "Which MCP servers to include?",
      choices: serverNames.map((s) => ({ name: s, value: s })),
    });
  }

  const strictMcp =
    mcp.length > 0
      ? await confirm({
          message: "Use --strict-mcp-config (block global MCP from loading)?",
          default: true,
        })
      : false;

  const skillsRaw = await input({
    message: "Skills directories (comma-separated paths, or leave blank):",
  });
  const skills = skillsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const modelChoice = await select({
    message: "Model:",
    choices: CLAUDE_MODELS,
  });
  const model =
    modelChoice === "__custom__"
      ? await input({ message: "Enter model ID:" })
      : modelChoice;

  const effortLevel = await select({
    message: "Effort level:",
    choices: EFFORT_LEVELS,
  });

  const settings = {
    ...(model ? { model } : {}),
    ...(effortLevel ? { effortLevel } : {}),
  };

  const profile: Profile = {
    name,
    ...(description ? { description } : {}),
    ...(mcp.length ? { mcp } : {}),
    ...(skills.length ? { skills } : {}),
    ...(strictMcp ? { strict_mcp: true } : {}),
    ...(Object.keys(settings).length ? { settings } : {}),
  };

  return profile;
}
