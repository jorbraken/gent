import { Command } from "commander";
import chalk from "chalk";
import { WorkItemService } from "../core/services/workItemService.js";
import { WorkItemRepository } from "../db/repositories/workItemRepository.js";
import { CommentRepository } from "../db/repositories/commentRepository.js";
import { ChangelogRepository } from "../db/repositories/changelogRepository.js";
import { MemoryRepository } from "../db/repositories/memoryRepository.js";
import { withProjectDb, globalRegistryOptions, parseId } from "./context.js";

export function registerDelete(program: Command): Command {
  const del = program.command("delete").description("Delete a profile, MCP server, or object by id");

  del
    .command("task <id>")
    .description("Delete a task")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const taskId = parseId(id, "task id");
        new WorkItemService(new WorkItemRepository(db)).delete("task", taskId);
        console.log(chalk.green(`Deleted task #${taskId}`));
      });
    });

  del
    .command("bug <id>")
    .description("Delete a bug")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const bugId = parseId(id, "bug id");
        new WorkItemService(new WorkItemRepository(db)).delete("bug", bugId);
        console.log(chalk.green(`Deleted bug #${bugId}`));
      });
    });

  del
    .command("comment <id>")
    .description("Delete a comment")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const commentId = parseId(id, "comment id");
        new CommentRepository(db).delete(commentId);
        console.log(chalk.green(`Deleted comment #${commentId}`));
      });
    });

  del
    .command("changelog <id>")
    .description("Delete a changelog entry")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const changelogId = parseId(id, "changelog id");
        new ChangelogRepository(db).delete(changelogId);
        console.log(chalk.green(`Deleted changelog #${changelogId}`));
      });
    });

  del
    .command("memory <id>")
    .description("Delete a memory")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const memoryId = parseId(id, "memory id");
        new MemoryRepository(db).delete(memoryId);
        console.log(chalk.green(`Deleted memory #${memoryId}`));
      });
    });

  return del;
}
