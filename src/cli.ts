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
  loadLocalConfig,
  saveConfig,
  ensureGentDir,
  displayGentDir,
  parentDirs,
  GLOBAL_GENT_DIR,
  CONFIG_PATH,
  PROFILES_DIR,
} from "./config.js";
import { registerScaffold, listScaffolds } from "./scaffolds.js";
import {
  pickProfile,
  initWizard,
  addMcpServerWizard,
  editMcpServerWizard,
  editProfileWizard,
  profileWizard,
} from "./interactive.js";
import path from "path";
import { registerCreate } from "./commands/create.js";
import { registerAdd } from "./commands/add.js";
import { registerList } from "./commands/list.js";
import { registerShow } from "./commands/show.js";
import { registerUpdate } from "./commands/update.js";
import { registerDelete } from "./commands/delete.js";
import { registerDone } from "./commands/done.js";

const program = new Command();

// opsys-derived verb-first commands (project/task/bug/comment/changelog/memory).
// gent's own entities (profile/mcp/scaffold) are attached to the same verb
// groups below so the whole CLI follows one `gent <verb> <type>` grammar.
const createCmd = registerCreate(program);
const addCmd = registerAdd(program);
const showCmd = registerShow(program);
const updateCmd = registerUpdate(program);
const deleteCmd = registerDelete(program);
registerDone(program);

program
  .name("gent")
  .description("Coding-agent environment profile manager for Claude Code, Pi, and Codex")
  .version("0.2.0")
  .argument("[profile]", "profile name(s) to activate — comma-separate to compose (e.g. dev,qa)")
  .option("--dry-run", "print the composed agent command without running it")
  .option("--agent <name>", `agent to run: ${AGENT_NAMES.join(" or ")} (overrides the profile)`)
  .option("--no-sandbox", "run locally even if the profile specifies a sandbox")
  .allowUnknownOption()
  .action(async (profileArg: string | undefined, options: { dryRun?: boolean; agent?: string; sandbox: boolean }) => {
    const rawArgs = program.args.slice(profileArg ? 1 : 0);
    const extraArgs: string[] = [];
    for (let i = 0; i < rawArgs.length; i++) {
      if (rawArgs[i] === "--dry-run" || rawArgs[i] === "--no-sandbox") continue;
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

    await run(profile, extraArgs, options.dryRun ?? false, options.sandbox === false);
  });

// gent init
program
  .command("init")
  .description("Interactive first-time setup")
  .action(async () => {
    await initWizard();
  });

// Recursively print a .gent dir's extends parents as an indented tree.
function printParentTree(dir: string, prefix: string, seen: Set<string>): void {
  const parents = parentDirs(dir);
  parents.forEach((parent, i) => {
    const isLast = i === parents.length - 1;
    const branch = isLast ? "└─ " : "├─ ";
    const key = path.resolve(parent);
    const exists = fs.existsSync(parent);
    const marker = !exists
      ? chalk.red(" (missing)")
      : seen.has(key)
        ? chalk.gray(" (cycle)")
        : "";
    console.log(prefix + chalk.gray(branch) + displayGentDir(parent) + marker);
    if (exists && !seen.has(key)) {
      printParentTree(parent, prefix + (isLast ? "   " : chalk.gray("│  ")), new Set([...seen, key]));
    }
  });
}

function printProfileList(): void {
  const profiles = listProfiles();
  if (profiles.length === 0) {
    console.log(chalk.yellow("No profiles. Run `gent init` to get started."));
    return;
  }
  for (const p of profiles) {
    const desc = p.description ? chalk.gray(` — ${p.description}`) : "";
    const mcp = p.mcp?.length ? chalk.cyan(` [mcp: ${p.mcp.join(", ")}]`) : "";
    console.log(`  ${chalk.bold(p.name)}${desc}${mcp}`);
  }
}

// gent list (bare = profiles; also hosts list project/task/bug/... subcommands)
const listCmd = program
  .command("list")
  .description("List profiles, MCP servers, scaffolds, projects, or project objects")
  .action(() => printProfileList());
registerList(listCmd);

listCmd
  .command("profile")
  .alias("profiles")
  .description("List all profiles")
  .action(() => printProfileList());

listCmd
  .command("mcp")
  .description("List registered MCP servers")
  .action(() => {
    const config = loadConfig();
    const servers = Object.entries(config.mcp_servers);
    if (servers.length === 0) {
      console.log(chalk.yellow("No MCP servers registered. Run `gent add mcp`."));
      return;
    }
    const localNames = new Set(Object.keys(loadLocalConfig().mcp_servers));
    for (const [name, def] of servers) {
      const detail =
        def.type === "stdio"
          ? chalk.gray(`${def.command} ${(def.args ?? []).join(" ")}`)
          : chalk.gray(def.url ?? "");
      const inherited = localNames.has(name) ? "" : chalk.gray(" (inherited)");
      console.log(`  ${chalk.bold(name)} ${chalk.cyan(`[${def.type}]`)} ${detail}${inherited}`);
    }
  });

listCmd
  .command("scaffold")
  .description("List tracked .gent folders and the hierarchy they extend")
  .action(() => {
    const scaffolds = listScaffolds();
    if (scaffolds.length === 0) {
      console.log(chalk.yellow("No tracked .gent folders. Run `gent create scaffold` in a project."));
      return;
    }
    console.log(chalk.bold("\nTracked .gent folders:\n"));
    for (const dir of scaffolds) {
      const exists = fs.existsSync(dir);
      const missing = exists ? "" : chalk.red(" (missing)");
      console.log(chalk.bold(displayGentDir(dir)) + missing);
      if (exists) printParentTree(dir, "", new Set([path.resolve(dir)]));
      console.log();
    }
  });

// gent create profile / create scaffold
createCmd
  .command("profile [name]")
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

createCmd
  .command("scaffold")
  .description("Create a project-local .gent/ folder in the current directory")
  .action(() => {
    const localDir = path.join(process.cwd(), ".gent");
    if (fs.existsSync(localDir)) {
      console.log(chalk.yellow(`.gent/ already exists at ${localDir}`));
      registerScaffold(localDir); // ensure pre-existing folders get tracked too
      return;
    }
    fs.mkdirSync(path.join(localDir, "profiles"), { recursive: true });
    fs.mkdirSync(path.join(localDir, "skills"), { recursive: true });
    fs.writeFileSync(
      path.join(localDir, "config.yaml"),
      yaml.dump({ mcp_servers: {}, extend_global: true }),
      "utf8"
    );
    registerScaffold(localDir);
    console.log(chalk.green(`Created .gent/ in ${process.cwd()}`));
    console.log(chalk.gray("  Run `gent create profile` to add your first profile."));
    console.log(chalk.gray("  gent will use this .gent/ automatically when run from this directory."));
    console.log(
      chalk.gray(
        "  extend_global: true is set, so it also inherits profiles, skills, and MCP servers from ~/.gent."
      )
    );
  });

// gent add mcp
addCmd
  .command("mcp")
  .description("Register a new MCP server")
  .action(async () => {
    ensureGentDir();
    const config = loadConfig();
    await addMcpServerWizard(config.mcp_servers);
  });

// gent show profile <name>
showCmd
  .command("profile <name>")
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
    if (p.sandbox) row("sandbox", chalk.cyan(p.sandbox));
    if (p.skills?.length) row("skills", p.skills.join(", "));
    if (p.settings) {
      const KNOWN = new Set([
        "model",
        "permissionMode",
        "effortLevel",
        "codexProfile",
        "approvalPolicy",
        "sandboxMode",
        "modelVerbosity",
        "personality",
      ]);
      if (p.settings.model) row("model", String(p.settings.model));
      if (p.settings.permissionMode) row("permission", String(p.settings.permissionMode));
      if (p.settings.effortLevel) row("effort", String(p.settings.effortLevel));
      if (p.settings.codexProfile) row("codexProfile", String(p.settings.codexProfile));
      if (p.settings.approvalPolicy) row("approval", String(p.settings.approvalPolicy));
      if (p.settings.sandboxMode) row("sandbox", String(p.settings.sandboxMode));
      if (p.settings.modelVerbosity) row("verbosity", String(p.settings.modelVerbosity));
      if (p.settings.personality) row("personality", String(p.settings.personality));
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

// gent update profile <name> / update mcp <name>
updateCmd
  .command("profile <name>")
  .description("Edit a profile interactively")
  .action(async (name: string) => {
    if (!profileExists(name)) {
      console.error(chalk.red(`Profile "${name}" not found.`));
      process.exit(1);
    }
    await editProfileWizard(name);
  });

updateCmd
  .command("mcp <name>")
  .description("Edit an existing MCP server")
  .action(async (name: string) => {
    const config = loadConfig();
    if (!config.mcp_servers[name]) {
      console.error(chalk.red(`MCP server "${name}" not found.`));
      process.exit(1);
    }
    await editMcpServerWizard(name);
  });

// gent delete profile <name> / delete mcp <name>
deleteCmd
  .command("profile <name>")
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

deleteCmd
  .command("mcp <name>")
  .description("Remove an MCP server from the registry")
  .action(async (name: string) => {
    const config = loadLocalConfig();
    if (!config.mcp_servers[name]) {
      if (loadConfig().mcp_servers[name]) {
        console.error(
          chalk.red(
            `MCP server "${name}" is inherited from ${displayGentDir(GLOBAL_GENT_DIR)} — remove it there.`
          )
        );
      } else {
        console.error(chalk.red(`MCP server "${name}" not found.`));
      }
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
