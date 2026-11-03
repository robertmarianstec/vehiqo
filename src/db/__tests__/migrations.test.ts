import { createTestDatabase } from '@/test/sqlite';

import { runMigrations } from '../migrations';
import { SCHEMA_VERSION } from '../schema';

// An independent snapshot of the previously shipped daily-check schema.
const V1 = `
CREATE TABLE daily_checks (id TEXT PRIMARY KEY, vehicle_type TEXT NOT NULL,
  started_at INTEGER, completed_at INTEGER, signature_uri TEXT, notes TEXT,
  gps_lat REAL, gps_lng REAL, created_at INTEGER, updated_at INTEGER, synced_at INTEGER);
CREATE TABLE daily_check_items (id TEXT PRIMARY KEY,
  daily_check_id TEXT REFERENCES daily_checks(id) ON DELETE CASCADE,
  item_key TEXT, checked INTEGER DEFAULT 0, photo_uri TEXT, note TEXT,
  created_at INTEGER, updated_at INTEGER);
CREATE TABLE work_sessions (id TEXT PRIMARY KEY, mode TEXT, started_at INTEGER);
INSERT INTO work_sessions VALUES ('work', 'driving', 10);
INSERT INTO daily_checks VALUES ('legacy', 'tractor', 1, 2, 'old-signature', 'old-note', 50, 20, 1, 2, NULL);
INSERT INTO daily_check_items VALUES ('item', 'legacy', 'tyres', 1, 'old-photo', 'old-item-note', 1, 2);
PRAGMA user_version = 1;
`;

it('creates a fresh database with daily checks and leaves foreign keys enabled', async () => {
  const { sqlite, adapter } = createTestDatabase();
  try {
    await runMigrations(adapter);
    expect(sqlite.prepare('PRAGMA user_version').get()).toEqual({
      user_version: SCHEMA_VERSION,
    });
    expect(sqlite.prepare('PRAGMA foreign_keys').get()).toEqual({
      foreign_keys: 1,
    });
    expect(
      sqlite
        .prepare('SELECT driver_name, trailer_type FROM daily_checks')
        .all(),
    ).toEqual([]);
    expect(
      sqlite
        .prepare('SELECT has_issue, is_critical FROM daily_check_items')
        .all(),
    ).toEqual([]);
  } finally {
    sqlite.close();
  }
});

it('migrates v1 without deleting legacy data, children, or work history', async () => {
  const { sqlite, adapter } = createTestDatabase(V1);
  try {
    await runMigrations(adapter);
    expect(sqlite.prepare('SELECT * FROM daily_checks').get()).toMatchObject({
      id: 'legacy',
      signature_uri: 'old-signature',
      gps_lat: 50,
      gps_lng: 20,
      notes: 'old-note',
      driver_name: null,
      trailer_type: null,
    });
    expect(
      sqlite.prepare('SELECT * FROM daily_check_items').get(),
    ).toMatchObject({
      daily_check_id: 'legacy',
      checked: 1,
      photo_uri: 'old-photo',
      note: 'old-item-note',
      has_issue: 0,
      is_critical: 0,
    });
    expect(sqlite.prepare('SELECT * FROM work_sessions').get()).toEqual({
      id: 'work',
      mode: 'driving',
      started_at: 10,
    });
    await runMigrations(adapter);
    expect(
      sqlite.prepare('SELECT COUNT(*) AS count FROM daily_checks').get(),
    ).toEqual({ count: 1 });
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    sqlite.close();
  }
});

it('rolls back all schema changes and version on a migration failure, then retries', async () => {
  const { sqlite, adapter } = createTestDatabase(V1);
  const execute = adapter.execAsync;
  adapter.execAsync = async (sql) => {
    await execute(sql);
    throw new Error('disk full');
  };
  try {
    await expect(runMigrations(adapter)).rejects.toThrow('disk full');
    expect(sqlite.prepare('PRAGMA user_version').get()).toEqual({
      user_version: 1,
    });
    expect(
      sqlite
        .prepare('PRAGMA table_info(daily_checks)')
        .all()
        .some((column) => column.name === 'driver_name'),
    ).toBe(false);
    adapter.execAsync = execute;
    await runMigrations(adapter);
    expect(sqlite.prepare('PRAGMA user_version').get()).toEqual({
      user_version: 2,
    });
  } finally {
    sqlite.close();
  }
});

it('does not silently use a database from a newer application', async () => {
  const { sqlite, adapter } = createTestDatabase('PRAGMA user_version = 99;');
  try {
    await expect(runMigrations(adapter)).rejects.toThrow('Unsupported');
  } finally {
    sqlite.close();
  }
});
