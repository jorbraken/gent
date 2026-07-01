import { requireString } from '../validation.js';
import { ChangelogRepository, type ChangelogRecord } from '../../db/repositories/changelogRepository.js';
export class ChangelogService {
  constructor(private readonly repository: ChangelogRepository) {}
  create(input: { title: unknown; body?: unknown }): ChangelogRecord { return this.repository.create({ title: requireString(input.title, 'title'), body: typeof input.body === 'string' ? input.body : '' }); }
}
