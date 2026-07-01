import { Command } from "commander";
import chalk from "chalk";
import { WorkItemService } from "../core/services/workItemService.js";
import { WorkItemRepository } from "../db/repositories/workItemRepository.js";
import { withProjectDb, globalRegistryOptions, parseId } from "./context.js";

export function registerDone(program: Command): void {
  const done = program.command("done").description("Mark a task or bug as done");

  done
    .command("task <id>")
    .description("Mark a task as done")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const item = new WorkItemService(new WorkItemRepository(db)).done("task", parseId(id, "task id"));
        console.log(chalk.green(`Updated task #${item.id} to done`));
      });
    });

  done
    .command("bug <id>")
    .description("Mark a bug as done")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const item = new WorkItemService(new WorkItemRepository(db)).done("bug", parseId(id, "bug id"));
        console.log(chalk.green(`Updated bug #${item.id} to done`));
      });
    });
}
