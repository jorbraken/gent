import { assertMemoryKind, requireString } from '../validation.js';
import { MemoryRepository, type MemoryRecord } from '../../db/repositories/memoryRepository.js';
export class MemoryService {
  constructor(private readonly repository: MemoryRepository) {}
  create(input: { title: unknown; body?: unknown; kind: unknown }): MemoryRecord { return this.repository.create({ title: requireString(input.title, 'title'), body: typeof input.body === 'string' ? input.body : '', kind: assertMemoryKind(input.kind) }); }
}
