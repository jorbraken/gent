import { Command } from "commander";
import { formatRows } from "../format.js";
import { WorkItemService } from "../core/services/workItemService.js";
import { WorkItemRepository } from "../db/repositories/workItemRepository.js";
import { CommentRepository } from "../db/repositories/commentRepository.js";
import { ChangelogRepository } from "../db/repositories/changelogRepository.js";
import { MemoryRepository } from "../db/repositories/memoryRepository.js";
import { withRegistry, withProjectDb, globalRegistryOptions } from "./context.js";

// Attaches project/task/bug/comment/changelog/memory subcommands to gent's
// existing top-level `list` command (which also lists profiles when run bare).
export function registerList(list: Command): void {
  list
    .command("project")
    .alias("projects")
    .description("List registered projects")
    .action(async () => {
      await withRegistry(globalRegistryOptions(), (registry) => {
        console.log(
          formatRows(
            registry.list().map((project) => ({ id: project.id, name: project.name, rootPath: project.rootPath })),
            ["id", "name", "rootPath"]
          )
        );
      });
    });

  list
    .command("task")
    .alias("tasks")
    .description("List tasks")
    .option("--status <status>", "filter by status")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (opts: { status?: string; project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const rows = new WorkItemService(new WorkItemRepository(db)).list("task", { status: opts.status });
        console.log(formatRows(rows.map((item) => ({ id: item.id, title: item.title, status: item.status })), ["id", "title", "status"]));
      });
    });

  list
    .command("bug")
    .alias("bugs")
    .description("List bugs")
    .option("--status <status>", "filter by status")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (opts: { status?: string; project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const rows = new WorkItemService(new WorkItemRepository(db)).list("bug", { status: opts.status });
        console.log(formatRows(rows.map((item) => ({ id: item.id, title: item.title, status: item.status })), ["id", "title", "status"]));
      });
    });

  list
    .command("comment")
    .alias("comments")
    .description("List comments")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const rows = new CommentRepository(db).list();
        console.log(
          formatRows(
            rows.map((comment) => ({ id: comment.id, parentType: comment.parentType, parentId: comment.parentId, body: comment.body })),
            ["id", "parentType", "parentId", "body"]
          )
        );
      });
    });

  list
    .command("changelog")
    .description("List changelog entries")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const rows = new ChangelogRepository(db).list();
        console.log(formatRows(rows.map((entry) => ({ id: entry.id, title: entry.title, body: entry.body })), ["id", "title", "body"]));
      });
    });

  list
    .command("memory")
    .alias("memories")
    .description("List memories")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const rows = new MemoryRepository(db).list();
        console.log(formatRows(rows.map((memory) => ({ id: memory.id, title: memory.title, kind: memory.kind })), ["id", "title", "kind"]));
      });
    });
}
