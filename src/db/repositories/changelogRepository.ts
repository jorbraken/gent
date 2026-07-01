import type Database from 'better-sqlite3';
export interface ChangelogRecord { id: number; title: string; body: string; createdAt: string; updatedAt: string; }
interface ChangelogRow { id: number; title: string; body: string; created_at: string; updated_at: string; }
function mapRow(row: ChangelogRow): ChangelogRecord { return { id: row.id, title: row.title, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at }; }
export class ChangelogRepository {
  constructor(private readonly db: Database.Database) {}
  create(input: { title: string; body: string }): ChangelogRecord { const result = this.db.prepare('insert into changelog (title, body) values (?, ?)').run(input.title, input.body); return this.get(Number(result.lastInsertRowid)) as ChangelogRecord; }
  list(): ChangelogRecord[] { return (this.db.prepare('select * from changelog order by id').all() as ChangelogRow[]).map(mapRow); }
  get(id: number): ChangelogRecord | undefined { const row = this.db.prepare('select * from changelog where id = ?').get(id) as ChangelogRow | undefined; return row ? mapRow(row) : undefined; }
  update(id: number, input: { title?: string; body?: string }): ChangelogRecord { const existing = this.get(id); this.db.prepare("update changelog set title = ?, body = ?, updated_at = datetime('now') where id = ?").run(input.title ?? existing?.title, input.body ?? existing?.body, id); return this.get(id) as ChangelogRecord; }
  delete(id: number): void { this.db.prepare('delete from changelog where id = ?').run(id); }
}
