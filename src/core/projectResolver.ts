import { relative, resolve } from 'node:path';
import { OpsysError } from './errors.js';
import type { RegistryProject } from './types.js';
import type { ProjectRegistryRepository } from '../db/repositories/projectRegistryRepository.js';

export interface ResolveProjectInput {
  registry: ProjectRegistryRepository;
  cwd: string;
  projectRef?: string;
}

function isWithinOrEqual(rootPath: string, cwd: string): boolean {
  const relativePath = relative(resolve(rootPath), resolve(cwd));
  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.startsWith('/'));
}

export function resolveProject(input: ResolveProjectInput): RegistryProject {
  if (input.projectRef) {
    const project = input.registry.findByNameOrId(input.projectRef);
    if (!project) throw new OpsysError(`Project not found: ${input.projectRef}`);
    return project;
  }

  const matches = input.registry.list().filter((project) => isWithinOrEqual(project.rootPath, input.cwd));
  if (matches.length === 0) {
    throw new OpsysError('No project resolved; run opsys init project <name> or pass --project <name-or-id>');
  }
  if (matches.length > 1) {
    throw new OpsysError('Ambiguous project; pass --project <name-or-id>');
  }
  return matches[0];
}
