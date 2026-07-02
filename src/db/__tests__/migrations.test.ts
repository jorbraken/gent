import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { migrateGlobalDb } from '../migrations/global.js';
import { migrateProjectDb } from '../migrations/project.js';

let tempDirs: string[] = [];

function tempDbPath(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'opsys-migrations-'));
  tempDirs.push(dir);
  return join(dir, name);
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe('migrations', () => {
  it('creates the global registry schema', () => {
    const db = openDatabase(tempDbPath('projects.db'));
    migrateGlobalDb(db);

    const tables = db.prepare("select name from sqlite_master where type = 'table' order by name").all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toEqual(['projects', 'schema_migrations']);
    db.close();
  });

  it('creates the project schema', () => {
    const db = openDatabase(tempDbPath('project.db'));
    migrateProjectDb(db);

    const tables = db.prepare("select name from sqlite_master where type = 'table' order by name").all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toEqual(['bugs', 'changelog', 'comments', 'memories', 'project_meta', 'schema_migrations', 'tasks']);
    db.close();
  });

  it('creates project indexes and constraints', () => {
    const db = openDatabase(tempDbPath('project.db'));
    migrateProjectDb(db);

    const indexes = db.prepare("select name from sqlite_master where type = 'index' and name not like 'sqlite_%' order by name").all() as Array<{ name: string }>;
    expect(indexes.map((row) => row.name)).toEqual([
      'idx_bugs_status_id',
      'idx_comments_parent',
      'idx_memories_kind_id',
      'idx_tasks_status_id',
    ]);
    expect(() => db.prepare("insert into tasks (title, description, status, priority) values ('x', '', 'bad', 'normal')").run()).toThrow();
    expect(() => db.prepare("insert into memories (title, body, kind) values ('x', '', 'bad')").run()).toThrow();
    db.close();
  });

  it('runs project migrations idempotently', () => {
    const db = openDatabase(tempDbPath('project.db'));
    migrateProjectDb(db);
    migrateProjectDb(db);

    const rows = db.prepare('select id, name from schema_migrations order by id').all() as Array<{ id: number; name: string }>;
    expect(rows).toEqual([
      { id: 1, name: '001_project_schema' },
      { id: 2, name: '002_constraints_and_indexes' },
    ]);
    db.close();
  });
});
