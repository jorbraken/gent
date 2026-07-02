import { join, resolve } from 'node:path';
import type { RegistryProject } from '../types.js';
import { requireString } from '../validation.js';
import { openDatabase } from '../../db/connection.js';
import { migrateProjectDb } from '../../db/migrations/project.js';
import { ProjectMetaRepository } from '../../db/repositories/projectMetaRepository.js';
import type { ProjectRegistryRepository } from '../../db/repositories/projectRegistryRepository.js';
import { trustGentDir } from '../../trust.js';

export class ProjectService {
  constructor(private readonly registry: ProjectRegistryRepository) {}

  initProject(input: { name: unknown; rootPath: string }): RegistryProject {
    const name = requireString(input.name, 'project name');
    const rootPath = resolve(input.rootPath);
    const dbPath = join(rootPath, '.gent', 'project.db');
    const projectDb = openDatabase(dbPath);
    try {
      migrateProjectDb(projectDb);
      new ProjectMetaRepository(projectDb).upsert({ name, rootPath });
    } finally {
      projectDb.close();
    }
    trustGentDir(join(rootPath, '.gent'));
    return this.registry.create({ name, rootPath, dbPath });
  }
}
