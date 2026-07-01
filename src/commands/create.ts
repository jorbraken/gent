import { Command } from "commander";
import chalk from "chalk";
import { ProjectService } from "../core/services/projectService.js";
import { withRegistry, globalRegistryOptions } from "./context.js";

export function registerCreate(program: Command): Command {
  const create = program.command("create").description("Create a profile, project, or scaffold");

  create
    .command("project <name>")
    .description("Register a new project, initializing its .opsys/project.db")
    .option("--yes", "create the global registry non-interactively if it doesn't exist yet")
    .action(async (name: string, opts: { yes?: boolean }) => {
      await withRegistry(globalRegistryOptions(opts.yes), (registry) => {
        const project = new ProjectService(registry).initProject({ name, rootPath: process.cwd() });
        console.log(chalk.green(`Initialized project ${project.name} at ${project.rootPath}`));
      });
    });

  return create;
}
