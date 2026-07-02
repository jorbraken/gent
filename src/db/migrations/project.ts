import type Database from 'better-sqlite3';
import { MEMORY_KINDS, WORK_STATUSES } from '../../core/types.js';

interface Migration {
  id: number;
  name: string;
  up(db: Database.Database): void;
}

function quoted(values: readonly string[]): string {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
}

function tableSql(db: Database.Database, table: string): string {
  const row = db.prepare("select sql from sqlite_master where type = 'table' and name = ?").get(table) as { sql: string } | undefined;
  return row?.sql ?? '';
}

function rebuildWorkTable(
  db: Database.Database,
  table: 'tasks' | 'bugs',
  levelColumn: 'priority' | 'severity',
): void {
  const tmp = `${table}_new`;
  db.exec(`
    create table ${tmp} (
      id integer primary key,
      title text not null,
      description text not null default '',
      status text not null check (status in (${quoted(WORK_STATUSES)})),
      ${levelColumn} text not null default 'normal',
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now')),
      completed_at text
    );
    insert into ${tmp} (id, title, description, status, ${levelColumn}, created_at, updated_at, completed_at)
      select id, title, description, status, ${levelColumn}, created_at, updated_at, completed_at from ${table};
    drop table ${table};
    alter table ${tmp} rename to ${table};
  `);
}

function rebuildMemoriesTable(db: Database.Database): void {
  db.exec(`
    create table memories_new (
      id integer primary key,
      title text not null,
      body text not null default '',
      kind text not null check (kind in (${quoted(MEMORY_KINDS)})),
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    );
    insert into memories_new (id, title, body, kind, created_at, updated_at)
      select id, title, body, kind, created_at, updated_at from memories;
    drop table memories;
    alter table memories_new rename to memories;
  `);
}

export function migrateProjectDb(db: Database.Database): void {
  db.exec(`
    create table if not exists schema_migrations (
      id integer primary key,
      name text not null unique,
      applied_at text not null default (datetime('now'))
    );
  `);

  const migrations: Migration[] = [
    {
      id: 1,
      name: '001_project_schema',
      up(database) {
        database.exec(`
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
            status text not null check (status in (${quoted(WORK_STATUSES)})),
            priority text not null default 'normal',
            created_at text not null default (datetime('now')),
            updated_at text not null default (datetime('now')),
            completed_at text
          );

          create table if not exists bugs (
            id integer primary key,
            title text not null,
            description text not null default '',
            status text not null check (status in (${quoted(WORK_STATUSES)})),
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
            kind text not null check (kind in (${quoted(MEMORY_KINDS)})),
            created_at text not null default (datetime('now')),
            updated_at text not null default (datetime('now'))
          );
        `);
      },
    },
    {
      id: 2,
      name: '002_constraints_and_indexes',
      up(database) {
        if (!tableSql(database, 'tasks').includes('check (status in')) rebuildWorkTable(database, 'tasks', 'priority');
        if (!tableSql(database, 'bugs').includes('check (status in')) rebuildWorkTable(database, 'bugs', 'severity');
        if (!tableSql(database, 'memories').includes('check (kind in')) rebuildMemoriesTable(database);
        database.exec(`
          create index if not exists idx_tasks_status_id on tasks(status, id);
          create index if not exists idx_bugs_status_id on bugs(status, id);
          create index if not exists idx_comments_parent on comments(parent_type, parent_id);
          create index if not exists idx_memories_kind_id on memories(kind, id);
        `);
      },
    },
  ];

  const applied = new Set(
    (db.prepare('select id from schema_migrations').all() as Array<{ id: number }>).map((row) => row.id),
  );
  const run = db.transaction((migration: Migration) => {
    migration.up(db);
    db.prepare('insert or ignore into schema_migrations (id, name) values (?, ?)').run(migration.id, migration.name);
  });
  for (const migration of migrations) {
    if (!applied.has(migration.id)) run(migration);
  }
}
