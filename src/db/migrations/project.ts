import type Database from 'better-sqlite3';

export function migrateProjectDb(db: Database.Database): void {
  db.exec(`
    create table if not exists schema_migrations (
      id integer primary key,
      name text not null unique,
      applied_at text not null default (datetime('now'))
    );

    create table if not exists project_meta (
      id integer primary key check (id = 1),
      name text not null,
      root_path text not null,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    );

    create table if not exists tasks (
      id integer primary key,
      title text not null,
      description text not null default '',
      status text not null,
      priority text not null default 'normal',
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now')),
      completed_at text
    );

    create table if not exists bugs (
      id integer primary key,
      title text not null,
      description text not null default '',
      status text not null,
      severity text not null default 'normal',
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now')),
      completed_at text
    );

    create table if not exists comments (
      id integer primary key,
      parent_type text not null check (parent_type in ('task', 'bug')),
      parent_id integer not null,
      body text not null,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    );

    create table if not exists changelog (
      id integer primary key,
      title text not null,
      body text not null default '',
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    );

    create table if not exists memories (
      id integer primary key,
      title text not null,
      body text not null default '',
      kind text not null,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    );

    insert or ignore into schema_migrations (id, name) values (1, '001_project_schema');
  `);
}
