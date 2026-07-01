import { Command } from "commander";
import chalk from "chalk";
import { WorkItemService } from "../core/services/workItemService.js";
import { WorkItemRepository } from "../db/repositories/workItemRepository.js";
import { CommentRepository } from "../db/repositories/commentRepository.js";
import { ChangelogRepository } from "../db/repositories/changelogRepository.js";
import { MemoryRepository } from "../db/repositories/memoryRepository.js";
import { assertMemoryKind } from "../core/validation.js";
import { withProjectDb, globalRegistryOptions, parseId } from "./context.js";

export function registerUpdate(program: Command): Command {
  const update = program.command("update").description("Update a profile, MCP server, or object by id");

  update
    .command("task <id>")
    .description("Update a task")
    .option("--title <text>")
    .option("--status <status>")
    .option("--priority <level>")
    .option("--description <text>")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { title?: string; status?: string; priority?: string; description?: string; project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const item = new WorkItemService(new WorkItemRepository(db)).update("task", parseId(id, "task id"), {
          title: opts.title,
          status: opts.status,
          detail: opts.description,
          level: opts.priority,
        });
        console.log(chalk.green(`Updated task #${item.id}`));
      });
    });

  update
    .command("bug <id>")
    .description("Update a bug")
    .option("--title <text>")
    .option("--status <status>")
    .option("--severity <level>")
    .option("--description <text>")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { title?: string; status?: string; severity?: string; description?: string; project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const item = new WorkItemService(new WorkItemRepository(db)).update("bug", parseId(id, "bug id"), {
          title: opts.title,
          status: opts.status,
          detail: opts.description,
          level: opts.severity,
        });
        console.log(chalk.green(`Updated bug #${item.id}`));
      });
    });

  update
    .command("comment <id>")
    .description("Update a comment")
    .option("--body <text>")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { body?: string; project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const commentId = parseId(id, "comment id");
        const comment = new CommentRepository(db).update(commentId, { body: opts.body ?? "" });
        console.log(chalk.green(`Updated comment #${comment.id}`));
      });
    });

  update
    .command("changelog <id>")
    .description("Update a changelog entry")
    .option("--title <text>")
    .option("--body <text>")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { title?: string; body?: string; project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const changelogId = parseId(id, "changelog id");
        const entry = new ChangelogRepository(db).update(changelogId, { title: opts.title, body: opts.body });
        console.log(chalk.green(`Updated changelog #${entry.id}`));
      });
    });

  update
    .command("memory <id>")
    .description("Update a memory")
    .option("--title <text>")
    .option("--body <text>")
    .option("--kind <kind>", "note, decision, or lesson")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { title?: string; body?: string; kind?: string; project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const memoryId = parseId(id, "memory id");
        new MemoryRepository(db).update(memoryId, {
          title: opts.title,
          body: opts.body,
          kind: opts.kind === undefined ? undefined : assertMemoryKind(opts.kind),
        });
        console.log(chalk.green(`Updated memory #${memoryId}`));
      });
    });

  return update;
}
