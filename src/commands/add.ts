import { Command } from "commander";
import chalk from "chalk";
import { WorkItemService } from "../core/services/workItemService.js";
import { WorkItemRepository } from "../db/repositories/workItemRepository.js";
import { CommentService } from "../core/services/commentService.js";
import { CommentRepository } from "../db/repositories/commentRepository.js";
import { ChangelogService } from "../core/services/changelogService.js";
import { ChangelogRepository } from "../db/repositories/changelogRepository.js";
import { MemoryService } from "../core/services/memoryService.js";
import { MemoryRepository } from "../db/repositories/memoryRepository.js";
import { OpsysError } from "../core/errors.js";
import { withProjectDb, globalRegistryOptions, parseId } from "./context.js";

export function registerAdd(program: Command): Command {
  const add = program.command("add").description("Create an MCP server, task, bug, comment, changelog entry, or memory");

  add
    .command("task <title>")
    .description("Create a task")
    .option("--status <status>", "todo (default), in_progress, blocked, or done")
    .option("--priority <level>", "priority level (default: normal)")
    .option("--description <text>", "task detail")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (title: string, opts: { status?: string; priority?: string; description?: string; project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const item = new WorkItemService(new WorkItemRepository(db)).create("task", {
          title,
          status: opts.status,
          detail: opts.description,
          level: opts.priority,
        });
        console.log(chalk.green(`Created task #${item.id}`));
      });
    });

  add
    .command("bug <title>")
    .description("Create a bug")
    .option("--status <status>", "todo (default), in_progress, blocked, or done")
    .option("--severity <level>", "severity level (default: normal)")
    .option("--description <text>", "bug detail")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (title: string, opts: { status?: string; severity?: string; description?: string; project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const item = new WorkItemService(new WorkItemRepository(db)).create("bug", {
          title,
          status: opts.status,
          detail: opts.description,
          level: opts.severity,
        });
        console.log(chalk.green(`Created bug #${item.id}`));
      });
    });

  add
    .command("comment <body>")
    .description("Add a comment to a task or bug")
    .option("--task <id>", "attach to this task id")
    .option("--bug <id>", "attach to this bug id")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (body: string, opts: { task?: string; bug?: string; project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        if (!opts.task && !opts.bug) throw new OpsysError("Pass --task <id> or --bug <id> to attach the comment");
        const parentType = opts.task ? "task" : "bug";
        const parentId = parseId(opts.task ?? opts.bug, "parent id");
        const comment = new CommentService(new CommentRepository(db), new WorkItemRepository(db)).create({
          parentType,
          parentId,
          body,
        });
        console.log(chalk.green(`Created comment #${comment.id}`));
      });
    });

  add
    .command("changelog <title>")
    .description("Add a changelog entry")
    .option("--body <text>", "entry body")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (title: string, opts: { body?: string; project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const entry = new ChangelogService(new ChangelogRepository(db)).create({ title, body: opts.body });
        console.log(chalk.green(`Created changelog #${entry.id}`));
      });
    });

  add
    .command("memory <title>")
    .description("Record a memory (note, decision, or lesson)")
    .option("--body <text>", "memory body")
    .option("--kind <kind>", "note (default), decision, or lesson")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (title: string, opts: { body?: string; kind?: string; project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const memory = new MemoryService(new MemoryRepository(db)).create({
          title,
          body: opts.body,
          kind: opts.kind ?? "note",
        });
        console.log(chalk.green(`Created memory #${memory.id}`));
      });
    });

  return add;
}
