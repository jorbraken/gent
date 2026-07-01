import type Database from 'better-sqlite3';
import type { MemoryKind } from '../../core/types.js';
export interface MemoryRecord { id: number; title: string; body: string; kind: MemoryKind; createdAt: string; updatedAt: string; }
interface MemoryRow { id: number; title: string; body: string; kind: MemoryKind; created_at: string; updated_at: string; }
function mapRow(row: MemoryRow): MemoryRecord { return { id: row.id, title: row.title, body: row.body, kind: row.kind, createdAt: row.created_at, updatedAt: row.updated_at }; }
export class MemoryRepository {
  constructor(private readonly db: Database.Database) {}
  create(input: { title: string; body: string; kind: MemoryKind }): MemoryRecord { const result = this.db.prepare('insert into memories (title, body, kind) values (?, ?, ?)').run(input.title, input.body, input.kind); return this.get(Number(result.lastInsertRowid)) as MemoryRecord; }
  list(): MemoryRecord[] { return (this.db.prepare('select * from memories order by id').all() as MemoryRow[]).map(mapRow); }
  get(id: number): MemoryRecord | undefined { const row = this.db.prepare('select * from memories where id = ?').get(id) as MemoryRow | undefined; return row ? mapRow(row) : undefined; }
  update(id: number, input: { title?: string; body?: string; kind?: MemoryKind }): MemoryRecord { const existing = this.get(id); this.db.prepare("update memories set title = ?, body = ?, kind = ?, updated_at = datetime('now') where id = ?").run(input.title ?? existing?.title, input.body ?? existing?.body, input.kind ?? existing?.kind, id); return this.get(id) as MemoryRecord; }
  delete(id: number): void { this.db.prepare('delete from memories where id = ?').run(id); }
}
