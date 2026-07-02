import type Database from 'better-sqlite3';

export function migrateGlobalDb(db: Database.Database): void {
  db.exec(`
    create table if not exists schema_migrations (
      id integer primary key,
      name text not null unique,
      applied_at text not null default (datetime('now'))
    );

    create table if not exists projects (
      id integer primary key,
      name text not null unique,
      root_path text not null unique,
      db_path text not null,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    );
  `);
  const applied = db.prepare('select id from schema_migrations where id = 1').get();
  if (!applied) {
    const run = db.transaction(() => {
      db.exec(`
        create table if not exists projects (
          id integer primary key,
          name text not null unique,
          root_path text not null unique,
          db_path text not null,
          created_at text not null default (datetime('now')),
          updated_at text not null default (datetime('now'))
        );
      `);
      db.prepare('insert into schema_migrations (id, name) values (?, ?)').run(1, '001_global_registry');
    });
    run();
  }
}
