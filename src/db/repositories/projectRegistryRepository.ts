import type Database from 'better-sqlite3';
import { resolve } from 'node:path';
import type { RegistryProject } from '../../core/types.js';

interface ProjectRow {
  id: number;
  name: string;
  root_path: string;
  db_path: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ProjectRow): RegistryProject {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    dbPath: row.db_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProjectRegistryRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: { name: string; rootPath: string; dbPath: string }): RegistryProject {
    const rootPath = resolve(input.rootPath);
    const dbPath = resolve(input.dbPath);
    const result = this.db.prepare('insert into projects (name, root_path, db_path) values (?, ?, ?)').run(input.name, rootPath, dbPath);
    return this.getById(Number(result.lastInsertRowid));
  }

  getById(id: number): RegistryProject {
    const row = this.db.prepare('select * from projects where id = ?').get(id) as ProjectRow | undefined;
    if (!row) throw new Error(`Project not found: ${id}`);
    return mapRow(row);
  }

  findByNameOrId(ref: string): RegistryProject | undefined {
    const id = Number(ref);
    const row = Number.isInteger(id) && id > 0
      ? this.db.prepare('select * from projects where id = ?').get(id) as ProjectRow | undefined
      : this.db.prepare('select * from projects where name = ?').get(ref) as ProjectRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  list(): RegistryProject[] {
    const rows = this.db.prepare('select * from projects order by name').all() as ProjectRow[];
    return rows.map(mapRow);
  }
}
