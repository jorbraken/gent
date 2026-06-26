import { confirm, input, select } from "@inquirer/prompts";
import chalk from "chalk";
import { listProfiles, mergeProfiles, type Profile } from "./profiles.js";
import { listSkills, displayGentDir } from "./config.js";
import { AGENT_NAMES, getAdapter, type AgentName } from "./agents.js";

async function pickAgent(current: AgentName): Promise<AgentName> {
  return select<AgentName>({
    message: "Agent:",
    choices: AGENT_NAMES.map((a) => ({ name: a, value: a })),
    default: current,
  });
}

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

async function pickSkills(preSelected: string[]): Promise<string[]> {
  const { checkbox } = await import("@inquirer/prompts");
  const available = listSkills();

  if (available.length === 0) {
    if (preSelected.length === 0) {
      console.log(
        chalk.gray(`  No skills found. Add skill directories to ${displayGentDir()}/skills/<name>/`)
      );
    }
    return preSelected;
  }

  const allNames = [...new Set([...available, ...preSelected])].sort();
  return checkbox({
    message: "Skills to load:",
    choices: allNames.map((s) => ({
      name: s,
      value: s,
      checked: preSelected.includes(s),
    })),
  });
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

  const skills = await pickSkills(profile.skills ?? []);

  return {
    ...profile,
    ...(mcp !== undefined ? { mcp } : {}),
    skills: skills.length > 0 ? skills : undefined,
  };
}

export async function initWizard(): Promise<void> {
  console.log(chalk.bold("\nWelcome to gent!\n"));
  console.log(
    `This wizard will set up ${displayGentDir()} with an initial config.\n`
  );

  const { saveConfig, loadConfig, ensureGentDir, configExists } = await import(
    "./config.js"
  );
  const { saveProfile, profileExists } = await import("./profiles.js");

  ensureGentDir();

  if (configExists()) {
    const overwrite = await confirm({
      message:
        `${displayGentDir()}/config.yaml already exists. Continue and add to it?`,
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
  const { saveConfig, loadLocalConfig: loadConfig } = await import("./config.js");

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

export async function editMcpServerWizard(name: string): Promise<void> {
  const { saveConfig, loadConfig, loadLocalConfig } = await import("./config.js");

  // Prefill from the effective (possibly inherited) definition, but write the
  // result into the project-local config so we never copy ~/.gent wholesale.
  const existing = loadConfig().mcp_servers[name];
  if (!existing) throw new Error(`MCP server "${name}" not found.`);
  const config = loadLocalConfig();

  const type = await select({
    message: "Type:",
    choices: [
      { name: "stdio (local process)", value: "stdio" },
      { name: "http (remote HTTP endpoint)", value: "http" },
      { name: "sse (Server-Sent Events)", value: "sse" },
    ],
    default: existing.type,
  });

  if (type === "stdio") {
    const command = await input({
      message: "Command (e.g. npx):",
      default: existing.command ?? "",
    });
    const argsRaw = await input({
      message: "Args (comma-separated, e.g. -y,@modelcontextprotocol/server-github):",
      default: existing.args?.join(", ") ?? "",
    });
    const args = argsRaw.split(",").map((s) => s.trim()).filter(Boolean);

    const envDefault = existing.env
      ? Object.entries(existing.env).map(([k, v]) => `${k}=${v}`).join(", ")
      : "";
    const envRaw = await input({
      message: "Env vars (KEY=VALUE pairs, comma-separated, use ${VAR} for env refs):",
      default: envDefault,
    });
    const env: Record<string, string> = {};
    if (envRaw.trim()) {
      for (const pair of envRaw.split(",")) {
        const [k, ...rest] = pair.trim().split("=");
        if (k) env[k.trim()] = rest.join("=").trim();
      }
    }

    config.mcp_servers[name] = {
      type: "stdio",
      command,
      args,
      ...(Object.keys(env).length ? { env } : {}),
    };
    saveConfig(config);
  } else {
    const url = await input({
      message: "URL:",
      default: existing.url ?? "",
    });
    const headersDefault = existing.headers
      ? Object.entries(existing.headers).map(([k, v]) => `${k}=${v}`).join(", ")
      : "";
    const headersRaw = await input({
      message: "Headers (KEY=VALUE pairs, comma-separated, or leave blank):",
      default: headersDefault,
    });
    const headers: Record<string, string> = {};
    if (headersRaw.trim()) {
      for (const pair of headersRaw.split(",")) {
        const [k, ...rest] = pair.trim().split("=");
        if (k) headers[k.trim()] = rest.join("=").trim();
      }
    }

    config.mcp_servers[name] = {
      type: type as "http" | "sse",
      url,
      ...(Object.keys(headers).length ? { headers } : {}),
    };
    saveConfig(config);
  }

  console.log(chalk.green(`MCP server "${name}" updated.`));
}

export async function editProfileWizard(name: string): Promise<void> {
  const { saveProfile, loadProfile, profilePath } = await import("./profiles.js");
  const { loadConfig } = await import("./config.js");
  const { checkbox } = await import("@inquirer/prompts");

  const existing = loadProfile(name);
  const config = loadConfig();

  const newName = await input({ message: "Profile name:", default: existing.name });
  const agent = await pickAgent(existing.agent ?? "claude");
  const adapter = getAdapter(agent);
  const description = await input({
    message: "Description (optional):",
    default: existing.description ?? "",
  });

  const serverNames = Object.keys(config.mcp_servers);
  let mcp: string[] = adapter.supportsMcp ? existing.mcp ?? [] : [];
  if (adapter.supportsMcp && serverNames.length > 0) {
    mcp = await checkbox({
      message: "Which MCP servers to include?",
      choices: serverNames.map((s) => ({
        name: s,
        value: s,
        checked: (existing.mcp ?? []).includes(s),
      })),
    });
  }

  const strictMcp =
    adapter.supportsMcp && mcp.length > 0
      ? await confirm({
          message: "Use --strict-mcp-config (block global MCP from loading)?",
          default: existing.strict_mcp ?? true,
        })
      : false;

  const skills = await pickSkills(existing.skills ?? []);

  const existingModel = existing.settings?.model ?? "";
  const isKnownModel = adapter.wizardModels.some((m) => m.value === existingModel);
  const modelChoice = await select({
    message: "Model:",
    choices: adapter.wizardModels,
    default: isKnownModel ? existingModel : "__custom__",
  });
  const model =
    modelChoice === "__custom__"
      ? await input({ message: "Enter model ID:", default: existingModel })
      : modelChoice;

  const effortLevel = await select({
    message: adapter.thinkingPromptLabel,
    choices: adapter.wizardThinking,
    default: existing.settings?.effortLevel ?? "",
  });

  const { editor } = await import("@inquirer/prompts");
  const hasExistingPrompt = !!existing.system_prompt_append;
  const editPrompt = await confirm({
    message: hasExistingPrompt ? "Edit system prompt?" : "Add a system prompt to append?",
    default: hasExistingPrompt,
  });
  const system_prompt_append = editPrompt
    ? (await editor({ message: "System prompt to append:", default: existing.system_prompt_append ?? "" })).trim() || undefined
    : existing.system_prompt_append;

  const settings = {
    ...(existing.settings ?? {}),
    ...(model ? { model } : { model: undefined }),
    ...(effortLevel ? { effortLevel } : { effortLevel: undefined }),
  };
  const cleanSettings = Object.fromEntries(
    Object.entries(settings).filter(([, v]) => v !== undefined)
  );

  const updated: Profile = {
    ...existing,
    name: newName,
    ...(agent === "claude" ? { agent: undefined } : { agent }),
    ...(description ? { description } : { description: undefined }),
    ...(mcp.length ? { mcp } : { mcp: undefined }),
    ...(skills.length ? { skills } : { skills: undefined }),
    ...(strictMcp ? { strict_mcp: true } : { strict_mcp: undefined }),
    ...(Object.keys(cleanSettings).length ? { settings: cleanSettings } : { settings: undefined }),
    ...(system_prompt_append ? { system_prompt_append } : { system_prompt_append: undefined }),
  };

  if (newName !== name) {
    const { unlinkSync } = await import("fs");
    unlinkSync(profilePath(name));
  }

  saveProfile(updated);
  console.log(chalk.green(`Profile "${newName}" updated.`));
}

export async function profileWizard(
  mcpRegistry: Record<string, unknown>
): Promise<Profile> {
  const name = await input({ message: "Profile name (e.g. product):" });
  const agent = await pickAgent("claude");
  const adapter = getAdapter(agent);
  const description = await input({
    message: "Description (optional):",
  });

  const serverNames = adapter.supportsMcp ? Object.keys(mcpRegistry) : [];
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

  const skills = await pickSkills([]);

  const modelChoice = await select({
    message: "Model:",
    choices: adapter.wizardModels,
  });
  const model =
    modelChoice === "__custom__"
      ? await input({ message: "Enter model ID:" })
      : modelChoice;

  const effortLevel = await select({
    message: adapter.thinkingPromptLabel,
    choices: adapter.wizardThinking,
  });

  const { editor } = await import("@inquirer/prompts");
  const addPrompt = await confirm({ message: "Add a system prompt to append?", default: false });
  const system_prompt_append = addPrompt
    ? (await editor({ message: "System prompt to append:" })).trim() || undefined
    : undefined;

  const settings = {
    ...(model ? { model } : {}),
    ...(effortLevel ? { effortLevel } : {}),
  };

  const profile: Profile = {
    name,
    ...(agent === "claude" ? {} : { agent }),
    ...(description ? { description } : {}),
    ...(mcp.length ? { mcp } : {}),
    ...(skills.length ? { skills } : {}),
    ...(strictMcp ? { strict_mcp: true } : {}),
    ...(Object.keys(settings).length ? { settings } : {}),
    ...(system_prompt_append ? { system_prompt_append } : {}),
  };

  return profile;
}
