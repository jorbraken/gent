import type Database from 'better-sqlite3';
import { OpsysError } from '../../core/errors.js';
import type { WorkStatus } from '../../core/types.js';

export type WorkItemType = 'task' | 'bug';

export interface WorkItemRecord {
  id: number;
  type: WorkItemType;
  title: string;
  description: string;
  status: WorkStatus;
  level: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface WorkItemCreateInput {
  title: string;
  description: string;
  status: WorkStatus;
  level: string;
}

export interface WorkItemUpdateInput {
  title?: string;
  description?: string;
  status?: WorkStatus;
  level?: string;
}

interface WorkItemRow {
  id: number;
  title: string;
  description: string;
  status: WorkStatus;
  priority?: string;
  severity?: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

const TABLES = {
  task: { table: 'tasks', levelColumn: 'priority' },
  bug: { table: 'bugs', levelColumn: 'severity' },
} as const;

function tableFor(type: WorkItemType): { table: 'tasks' | 'bugs'; levelColumn: 'priority' | 'severity' } {
  return TABLES[type];
}

function mapRow(type: WorkItemType, row: WorkItemRow): WorkItemRecord {
  return {
    id: row.id,
    type,
    title: row.title,
    description: row.description,
    status: row.status,
    level: type === 'task' ? String(row.priority) : String(row.severity),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export class WorkItemRepository {
  constructor(private readonly db: Database.Database) {}

  create(type: WorkItemType, input: WorkItemCreateInput): WorkItemRecord {
    const { table, levelColumn } = tableFor(type);
    const result = this.db.prepare(`insert into ${table} (title, description, status, ${levelColumn}, completed_at) values (?, ?, ?, ?, ?)`).run(
      input.title,
      input.description,
      input.status,
      input.level,
      input.status === 'done' ? new Date().toISOString() : null,
    );
    return this.get(type, Number(result.lastInsertRowid)) as WorkItemRecord;
  }

  list(type: WorkItemType, filters: { status?: WorkStatus }): WorkItemRecord[] {
    const { table } = tableFor(type);
    const rows = filters.status
      ? this.db.prepare(`select * from ${table} where status = ? order by id`).all(filters.status) as WorkItemRow[]
      : this.db.prepare(`select * from ${table} order by id`).all() as WorkItemRow[];
    return rows.map((row) => mapRow(type, row));
  }

  get(type: WorkItemType, id: number): WorkItemRecord | undefined {
    const { table } = tableFor(type);
    const row = this.db.prepare(`select * from ${table} where id = ?`).get(id) as WorkItemRow | undefined;
    return row ? mapRow(type, row) : undefined;
  }

  update(type: WorkItemType, id: number, input: WorkItemUpdateInput): WorkItemRecord {
    const existing = this.get(type, id);
    if (!existing) throw new OpsysError(`${type} not found: ${id}`);
    const { table, levelColumn } = tableFor(type);
    const title = input.title ?? existing.title;
    const description = input.description ?? existing.description;
    const status = input.status ?? existing.status;
    const level = input.level ?? existing.level;
    const completedAt = status === 'done' ? (existing.completedAt ?? new Date().toISOString()) : null;
    this.db.prepare(`update ${table} set title = ?, description = ?, status = ?, ${levelColumn} = ?, completed_at = ?, updated_at = datetime('now') where id = ?`).run(
      title,
      description,
      status,
      level,
      completedAt,
      id,
    );
    return this.get(type, id) as WorkItemRecord;
  }

  delete(type: WorkItemType, id: number): void {
    const { table } = tableFor(type);
    this.db.prepare(`delete from ${table} where id = ?`).run(id);
  }
}
