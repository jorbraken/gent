import type Database from 'better-sqlite3';
import type { CommentParentType } from '../../core/types.js';

export interface CommentRecord { id: number; parentType: CommentParentType; parentId: number; body: string; createdAt: string; updatedAt: string; }
interface CommentRow { id: number; parent_type: CommentParentType; parent_id: number; body: string; created_at: string; updated_at: string; }
function mapRow(row: CommentRow): CommentRecord { return { id: row.id, parentType: row.parent_type, parentId: row.parent_id, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at }; }

export class CommentRepository {
  constructor(private readonly db: Database.Database) {}
  create(input: { parentType: CommentParentType; parentId: number; body: string }): CommentRecord {
    const result = this.db.prepare('insert into comments (parent_type, parent_id, body) values (?, ?, ?)').run(input.parentType, input.parentId, input.body);
    return this.get(Number(result.lastInsertRowid)) as CommentRecord;
  }
  list(): CommentRecord[] { return (this.db.prepare('select * from comments order by id').all() as CommentRow[]).map(mapRow); }
  get(id: number): CommentRecord | undefined { const row = this.db.prepare('select * from comments where id = ?').get(id) as CommentRow | undefined; return row ? mapRow(row) : undefined; }
  update(id: number, input: { body: string }): CommentRecord { this.db.prepare("update comments set body = ?, updated_at = datetime('now') where id = ?").run(input.body, id); return this.get(id) as CommentRecord; }
  delete(id: number): void { this.db.prepare('delete from comments where id = ?').run(id); }
}
