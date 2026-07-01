import { Command } from "commander";
import { WorkItemService } from "../core/services/workItemService.js";
import { WorkItemRepository } from "../db/repositories/workItemRepository.js";
import { CommentRepository } from "../db/repositories/commentRepository.js";
import { ChangelogRepository } from "../db/repositories/changelogRepository.js";
import { MemoryRepository } from "../db/repositories/memoryRepository.js";
import { OpsysError } from "../core/errors.js";
import { withProjectDb, globalRegistryOptions, parseId } from "./context.js";

export function registerShow(program: Command): Command {
  const show = program.command("show").description("Show a single profile or object by id");

  show
    .command("task <id>")
    .description("Show a task")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const item = new WorkItemService(new WorkItemRepository(db)).show("task", parseId(id, "task id"));
        console.log(`${item.id}\t${item.title}\t${item.status}\t${item.description}`);
      });
    });

  show
    .command("bug <id>")
    .description("Show a bug")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const item = new WorkItemService(new WorkItemRepository(db)).show("bug", parseId(id, "bug id"));
        console.log(`${item.id}\t${item.title}\t${item.status}\t${item.description}`);
      });
    });

  show
    .command("comment <id>")
    .description("Show a comment")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const commentId = parseId(id, "comment id");
        const comment = new CommentRepository(db).get(commentId);
        if (!comment) throw new OpsysError(`comment not found: ${commentId}`);
        console.log(`${comment.id}\t${comment.parentType}\t${comment.parentId}\t${comment.body}`);
      });
    });

  show
    .command("changelog <id>")
    .description("Show a changelog entry")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const changelogId = parseId(id, "changelog id");
        const entry = new ChangelogRepository(db).get(changelogId);
        if (!entry) throw new OpsysError(`changelog not found: ${changelogId}`);
        console.log(`${entry.id}\t${entry.title}\t${entry.body}`);
      });
    });

  show
    .command("memory <id>")
    .description("Show a memory")
    .option("--project <name-or-id>", "target a registered project instead of inferring from cwd")
    .action(async (id: string, opts: { project?: string }) => {
      await withProjectDb(opts.project, globalRegistryOptions(), (db) => {
        const memoryId = parseId(id, "memory id");
        const memory = new MemoryRepository(db).get(memoryId);
        if (!memory) throw new OpsysError(`memory not found: ${memoryId}`);
        console.log(`${memory.id}\t${memory.title}\t${memory.kind}\t${memory.body}`);
      });
    });

  return show;
}
