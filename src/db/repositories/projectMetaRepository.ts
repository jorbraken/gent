import type Database from 'better-sqlite3';

export class ProjectMetaRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(input: { name: string; rootPath: string }): void {
    this.db.prepare(`
      insert into project_meta (id, name, root_path) values (1, ?, ?)
      on conflict(id) do update set name = excluded.name, root_path = excluded.root_path, updated_at = datetime('now')
    `).run(input.name, input.rootPath);
  }
}
