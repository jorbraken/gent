import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { migrateProjectDb } from '../migrations/project.js';
import { WorkItemRepository } from '../repositories/workItemRepository.js';
import { CommentRepository } from '../repositories/commentRepository.js';
import { ChangelogRepository } from '../repositories/changelogRepository.js';
import { MemoryRepository } from '../repositories/memoryRepository.js';
import { WorkItemService } from '../../core/services/workItemService.js';
import { CommentService } from '../../core/services/commentService.js';
import { ChangelogService } from '../../core/services/changelogService.js';
import { MemoryService } from '../../core/services/memoryService.js';

let tempDirs: string[] = [];

function projectDb() {
  const dir = mkdtempSync(join(tmpdir(), 'opsys-repos-'));
  tempDirs.push(dir);
  const db = openDatabase(join(dir, 'project.db'));
  migrateProjectDb(db);
  return db;
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe('project repositories and services', () => {
  it('creates, lists, shows, updates, completes, and deletes tasks', () => {
    const db = projectDb();
    const service = new WorkItemService(new WorkItemRepository(db));
    const created = service.create('task', { title: 'Build CLI', status: 'todo', detail: 'parser', level: 'high' });
    expect(created.title).toBe('Build CLI');

    expect(service.show('task', created.id).description).toBe('parser');
    expect(service.list('task', { status: 'todo' })).toHaveLength(1);
    expect(service.update('task', created.id, { status: 'in_progress' }).status).toBe('in_progress');
    expect(service.done('task', created.id).status).toBe('done');
    service.delete('task', created.id);
    expect(service.list('task', {})).toEqual([]);
    db.close();
  });

  it('creates comments only for existing tasks or bugs', () => {
    const db = projectDb();
    const workItems = new WorkItemService(new WorkItemRepository(db));
    const comments = new CommentService(new CommentRepository(db), new WorkItemRepository(db));
    const task = workItems.create('task', { title: 'Needs comment', status: 'todo', detail: '', level: 'normal' });

    expect(comments.create({ parentType: 'task', parentId: task.id, body: 'first note' }).body).toBe('first note');
    expect(() => comments.create({ parentType: 'task', parentId: 999, body: 'bad' })).toThrow('task not found: 999');
    db.close();
  });

  it('creates changelog entries and memories', () => {
    const db = projectDb();
    const changelog = new ChangelogService(new ChangelogRepository(db));
    const memories = new MemoryService(new MemoryRepository(db));

    expect(changelog.create({ title: 'v0.1', body: 'Initial CLI' }).title).toBe('v0.1');
    expect(memories.create({ title: 'Repo pattern', body: 'Avoid ORM', kind: 'decision' }).kind).toBe('decision');
    expect(() => memories.create({ title: 'Bad', body: '', kind: 'random' })).toThrow('Invalid memory kind');
    db.close();
  });
});
