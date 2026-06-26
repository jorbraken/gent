import { Command } from "commander";
import chalk from "chalk";
import fs from "fs";
import yaml from "js-yaml";
import { run } from "./runner.js";
import { AGENT_NAMES, isAgentName } from "./agents.js";
import {
  listProfiles,
  loadProfile,
  mergeProfiles,
  saveProfile,
  profileExists,
  type Profile,
} from "./profiles.js";
import {
  loadConfig,
  saveConfig,
  ensureGentDir,
  CONFIG_PATH,
  PROFILES_DIR,
} from "./config.js";
import {
  pickProfile,
  initWizard,
  addMcpServerWizard,
  editMcpServerWizard,
  editProfileWizard,
  profileWizard,
} from "./interactive.js";
import path from "path";

const program = new Command();

program
  .name("gent")
  .description("Coding-agent environment profile manager for Claude Code and Pi")
  .version("0.1.0")
  .argument("[profile]", "profile name(s) to activate — comma-separate to compose (e.g. dev,qa)")
  .option("--dry-run", "print the composed agent command without running it")
  .option("--agent <name>", `agent to run: ${AGENT_NAMES.join(" or ")} (overrides the profile)`)
  .allowUnknownOption()
  .action(async (profileArg: string | undefined, options: { dryRun?: boolean; agent?: string }) => {
    const rawArgs = program.args.slice(profileArg ? 1 : 0);
    const extraArgs: string[] = [];
    for (let i = 0; i < rawArgs.length; i++) {
      if (rawArgs[i] === "--dry-run") continue;
      if (rawArgs[i] === "--agent") {
        i++; // skip the value too
        continue;
      }
      extraArgs.push(rawArgs[i]);
    }

    if (options.agent && !isAgentName(options.agent)) {
      console.error(
        chalk.red(`Unknown agent "${options.agent}". Valid agents: ${AGENT_NAMES.join(", ")}.`)
      );
      process.exit(1);
    }

    let profile: Profile;
    if (!profileArg) {
      profile = await pickProfile();
    } else {
      const names = profileArg.split(",").map((s) => s.trim()).filter(Boolean);
      profile =
        names.length === 1
          ? loadProfile(names[0])
          : mergeProfiles(names.map((n) => loadProfile(n)));
    }

    if (options.agent && isAgentName(options.agent)) {
      profile = { ...profile, agent: options.agent };
    }

    run(profile, extraArgs, options.dryRun ?? false);
  });

// gent list
program
  .command("list")
  .description("List all profiles")
  .action(() => {
    const profiles = listProfiles();
    if (profiles.length === 0) {
      console.log(chalk.yellow("No profiles. Run `gent init` to get started."));
      return;
    }
    for (const p of profiles) {
      const desc = p.description ? chalk.gray(` — ${p.description}`) : "";
      const mcp = p.mcp?.length
        ? chalk.cyan(` [mcp: ${p.mcp.join(", ")}]`)
        : "";
      console.log(`  ${chalk.bold(p.name)}${desc}${mcp}`);
    }
  });

// gent init
program
  .command("init")
  .description("Interactive first-time setup")
  .action(async () => {
    await initWizard();
  });

// gent scaffold
program
  .command("scaffold")
  .description("Create a project-local .gent/ folder in the current directory")
  .action(() => {
    const localDir = path.join(process.cwd(), ".gent");
    if (fs.existsSync(localDir)) {
      console.log(chalk.yellow(`.gent/ already exists at ${localDir}`));
      return;
    }
    fs.mkdirSync(path.join(localDir, "profiles"), { recursive: true });
    fs.mkdirSync(path.join(localDir, "skills"), { recursive: true });
    fs.writeFileSync(
      path.join(localDir, "config.yaml"),
      yaml.dump({ mcp_servers: {} }),
      "utf8"
    );
    console.log(chalk.green(`Created .gent/ in ${process.cwd()}`));
    console.log(chalk.gray("  Run `gent profile create` to add your first profile."));
    console.log(chalk.gray("  gent will use this .gent/ automatically when run from this directory."));
  });

// gent profile
const profileCmd = program.command("profile").description("Manage profiles");

profileCmd
  .command("show <name>")
  .description("Print a profile's configuration")
  .action((name: string) => {
    if (!profileExists(name)) {
      console.error(chalk.red(`Profile "${name}" not found.`));
      process.exit(1);
    }
    const p = loadProfile(name);
    const row = (label: string, value: string) =>
      console.log(`  ${chalk.gray(label.padEnd(12))} ${value}`);
    console.log();
    row("name", chalk.bold(p.name));
    row("agent", p.agent ?? "claude");
    if (p.description) row("description", p.description);
    if (p.extends) {
      const parents = ([] as string[]).concat(p.extends).join(", ");
      row("extends", chalk.cyan(parents));
    }
    if (p.mcp?.length) row("mcp", p.mcp.join(", "));
    if (p.strict_mcp) row("strict_mcp", "true");
    if (p.skills?.length) row("skills", p.skills.join(", "));
    if (p.settings) {
      const KNOWN = new Set(["model", "permissionMode", "effortLevel"]);
      if (p.settings.model) row("model", String(p.settings.model));
      if (p.settings.permissionMode) row("permission", String(p.settings.permissionMode));
      if (p.settings.effortLevel) row("effort", String(p.settings.effortLevel));
      for (const [k, v] of Object.entries(p.settings)) {
        if (!KNOWN.has(k) && v !== undefined) row(k, String(v));
      }
    }
    if (p.system_prompt_append) {
      const lines = p.system_prompt_append.trimEnd().split("\n");
      row("prompt", chalk.gray(lines[0]));
      for (const line of lines.slice(1)) {
        console.log(`  ${" ".repeat(12)} ${chalk.gray(line)}`);
      }
    }
    console.log();
  });

profileCmd
  .command("create [name]")
  .description("Create a new profile")
  .action(async (name?: string) => {
    const config = loadConfig();
    const profile = await profileWizard(config.mcp_servers);
    if (name) profile.name = name;
    if (profileExists(profile.name)) {
      const { confirm } = await import("@inquirer/prompts");
      const ok = await confirm({
        message: `Profile "${profile.name}" already exists. Overwrite?`,
        default: false,
      });
      if (!ok) return;
    }
    saveProfile(profile);
    console.log(chalk.green(`Profile "${profile.name}" saved. Run: gent ${profile.name}`));
  });

profileCmd
  .command("edit <name>")
  .description("Edit a profile interactively")
  .action(async (name: string) => {
    if (!profileExists(name)) {
      console.error(chalk.red(`Profile "${name}" not found.`));
      process.exit(1);
    }
    await editProfileWizard(name);
  });

profileCmd
  .command("delete <name>")
  .description("Delete a profile")
  .action(async (name: string) => {
    if (!profileExists(name)) {
      console.error(chalk.red(`Profile "${name}" not found.`));
      process.exit(1);
    }
    const { confirm } = await import("@inquirer/prompts");
    const ok = await confirm({
      message: `Delete profile "${name}"?`,
      default: false,
    });
    if (!ok) return;
    const { unlinkSync } = await import("fs");
    unlinkSync(path.join(PROFILES_DIR, `${name}.yaml`));
    console.log(chalk.green(`Profile "${name}" deleted.`));
  });

// gent mcp
const mcpCmd = program.command("mcp").description("Manage MCP server registry");

mcpCmd
  .command("list")
  .description("List registered MCP servers")
  .action(() => {
    const config = loadConfig();
    const servers = Object.entries(config.mcp_servers);
    if (servers.length === 0) {
      console.log(chalk.yellow("No MCP servers registered. Run `gent mcp add`."));
      return;
    }
    for (const [name, def] of servers) {
      const detail =
        def.type === "stdio"
          ? chalk.gray(`${def.command} ${(def.args ?? []).join(" ")}`)
          : chalk.gray(def.url ?? "");
      console.log(`  ${chalk.bold(name)} ${chalk.cyan(`[${def.type}]`)} ${detail}`);
    }
  });

mcpCmd
  .command("add")
  .description("Register a new MCP server")
  .action(async () => {
    ensureGentDir();
    const config = loadConfig();
    await addMcpServerWizard(config.mcp_servers);
  });

mcpCmd
  .command("edit <name>")
  .description("Edit an existing MCP server")
  .action(async (name: string) => {
    const config = loadConfig();
    if (!config.mcp_servers[name]) {
      console.error(chalk.red(`MCP server "${name}" not found.`));
      process.exit(1);
    }
    await editMcpServerWizard(name);
  });

mcpCmd
  .command("remove <name>")
  .description("Remove an MCP server from the registry")
  .action(async (name: string) => {
    const config = loadConfig();
    if (!config.mcp_servers[name]) {
      console.error(chalk.red(`MCP server "${name}" not found.`));
      process.exit(1);
    }
    const { confirm } = await import("@inquirer/prompts");
    const ok = await confirm({
      message: `Remove MCP server "${name}"?`,
      default: false,
    });
    if (!ok) return;
    delete config.mcp_servers[name];
    saveConfig(config);
    console.log(chalk.green(`MCP server "${name}" removed.`));
  });

program.parseAsync(process.argv).catch((err) => {
  if (err instanceof Error && err.name === "ExitPromptError") process.exit(0);
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
