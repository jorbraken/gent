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
});
