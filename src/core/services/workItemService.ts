import { OpsysError } from '../errors.js';
import { assertWorkStatus, requireString } from '../validation.js';
import type { WorkStatus } from '../types.js';
import { WorkItemRepository, type WorkItemRecord, type WorkItemType } from '../../db/repositories/workItemRepository.js';

export class WorkItemService {
  constructor(private readonly repository: WorkItemRepository) {}

  create(type: WorkItemType, input: { title: unknown; status?: unknown; detail?: unknown; level?: unknown }): WorkItemRecord {
    return this.repository.create(type, {
      title: requireString(input.title, 'title'),
      description: typeof input.detail === 'string' ? input.detail : '',
      status: input.status === undefined ? 'todo' : assertWorkStatus(input.status),
      level: typeof input.level === 'string' && input.level.trim() ? input.level.trim() : 'normal',
    });
  }

  list(type: WorkItemType, filters: { status?: unknown }): WorkItemRecord[] {
    return this.repository.list(type, { status: filters.status === undefined ? undefined : assertWorkStatus(filters.status) });
  }

  show(type: WorkItemType, id: number): WorkItemRecord {
    const item = this.repository.get(type, id);
    if (!item) throw new OpsysError(`${type} not found: ${id}`);
    return item;
  }

  update(type: WorkItemType, id: number, input: { title?: unknown; status?: unknown; detail?: unknown; level?: unknown }): WorkItemRecord {
    const update: { title?: string; description?: string; status?: WorkStatus; level?: string } = {};
    if (input.title !== undefined) update.title = requireString(input.title, 'title');
    if (input.detail !== undefined) update.description = typeof input.detail === 'string' ? input.detail : String(input.detail);
    if (input.status !== undefined) update.status = assertWorkStatus(input.status);
    if (input.level !== undefined) update.level = requireString(input.level, 'level');
    return this.repository.update(type, id, update);
  }

  done(type: WorkItemType, id: number): WorkItemRecord {
    return this.repository.update(type, id, { status: 'done' });
  }

  delete(type: WorkItemType, id: number): void {
    this.repository.delete(type, id);
  }
}
