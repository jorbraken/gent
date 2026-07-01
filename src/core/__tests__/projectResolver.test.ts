import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/connection.js';
import { migrateGlobalDb } from '../../db/migrations/global.js';
import { ProjectRegistryRepository } from '../../db/repositories/projectRegistryRepository.js';
import { resolveProject } from '../projectResolver.js';

let tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'opsys-resolver-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe('resolveProject', () => {
  it('resolves by explicit project name', () => {
    const dir = tempDir();
    const db = openDatabase(join(dir, 'projects.db'));
    migrateGlobalDb(db);
    const registry = new ProjectRegistryRepository(db);
    const project = registry.create({ name: 'demo', rootPath: join(dir, 'demo'), dbPath: join(dir, 'demo', '.gent', 'project.db') });

    expect(resolveProject({ registry, cwd: dir, projectRef: 'demo' })).toEqual(project);
    db.close();
  });

  it('infers project from current working directory', () => {
    const dir = tempDir();
    const rootPath = join(dir, 'demo');
    const db = openDatabase(join(dir, 'projects.db'));
    migrateGlobalDb(db);
    const registry = new ProjectRegistryRepository(db);
    const project = registry.create({ name: 'demo', rootPath, dbPath: join(rootPath, '.gent', 'project.db') });

    expect(resolveProject({ registry, cwd: join(rootPath, 'src') })).toEqual(project);
    db.close();
  });

  it('reports ambiguity when more than one registered root contains cwd', () => {
    const dir = tempDir();
    const db = openDatabase(join(dir, 'projects.db'));
    migrateGlobalDb(db);
    const registry = new ProjectRegistryRepository(db);
    registry.create({ name: 'parent', rootPath: join(dir, 'repo'), dbPath: join(dir, 'repo', '.gent', 'project.db') });
    registry.create({ name: 'child', rootPath: join(dir, 'repo', 'packages', 'child'), dbPath: join(dir, 'repo', 'packages', 'child', '.gent', 'project.db') });

    expect(() => resolveProject({ registry, cwd: join(dir, 'repo', 'packages', 'child', 'src') })).toThrow('Ambiguous project; pass --project <name-or-id>');
    db.close();
  });
});
