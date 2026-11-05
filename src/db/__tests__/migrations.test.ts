import { createTestDatabase } from '@/test/sqlite';

import { runMigrations } from '../migrations';
import { MIGRATION_2_SQL, SCHEMA_SQL, SCHEMA_VERSION } from '../schema';

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
      user_version: SCHEMA_VERSION,
    });
  } finally {
    sqlite.close();
  }
});

it('upgrades v2 without changing existing work, inspection or legacy fatigue rows', async () => {
  const { sqlite, adapter } = createTestDatabase(V1);
  try {
    sqlite.exec(MIGRATION_2_SQL + 'PRAGMA user_version = 2;');
    sqlite.exec(
      "CREATE TABLE fatigue_sessions (id TEXT PRIMARY KEY, woke_at INTEGER); INSERT INTO fatigue_sessions VALUES ('old-fatigue', 123);",
    );
    await runMigrations(adapter);
    expect(sqlite.prepare('SELECT id FROM work_sessions').get()).toEqual({
      id: 'work',
    });
    expect(sqlite.prepare('SELECT id FROM daily_checks').get()).toEqual({
      id: 'legacy',
    });
    expect(sqlite.prepare('SELECT * FROM fatigue_sessions').get()).toEqual({
      id: 'old-fatigue',
      woke_at: 123,
    });
    expect(sqlite.prepare('SELECT * FROM sleep_entries').all()).toEqual([]);
    expect(sqlite.prepare('SELECT * FROM fatigue_state').all()).toEqual([]);
    expect(sqlite.prepare('PRAGMA user_version').get()).toEqual({
      user_version: SCHEMA_VERSION,
    });
  } finally {
    sqlite.close();
  }
});

it('rolls back a failed v2-to-v3 migration and preserves existing data before retry', async () => {
  const { sqlite, adapter } = createTestDatabase(V1);
  const execute = adapter.execAsync;
  try {
    sqlite.exec(MIGRATION_2_SQL + 'PRAGMA user_version = 2;');
    adapter.execAsync = async (sql) => {
      await execute(sql);
      if (sql.includes('CREATE TABLE sleep_entries'))
        throw new Error('disk full');
    };
    await expect(runMigrations(adapter)).rejects.toThrow('disk full');
    expect(sqlite.prepare('PRAGMA user_version').get()).toEqual({
      user_version: 2,
    });
    expect(
      sqlite
        .prepare("SELECT name FROM sqlite_master WHERE name = 'sleep_entries'")
        .get(),
    ).toBeUndefined();
    expect(sqlite.prepare('SELECT id FROM daily_checks').get()).toEqual({
      id: 'legacy',
    });
    adapter.execAsync = execute;
    await runMigrations(adapter);
    expect(sqlite.prepare('PRAGMA user_version').get()).toEqual({
      user_version: SCHEMA_VERSION,
    });
  } finally {
    sqlite.close();
  }
});

const EARLY_V3 =
  V1 +
  MIGRATION_2_SQL +
  `
CREATE TABLE sleep_entries (id TEXT PRIMARY KEY, slept_at INTEGER NOT NULL,
  woke_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE fatigue_state (id INTEGER PRIMARY KEY, woke_at INTEGER,
  revision INTEGER NOT NULL, updated_at INTEGER NOT NULL);
INSERT INTO sleep_entries VALUES ('sleep', 100, 200, 300, 300);
INSERT INTO fatigue_state VALUES (1, 200, 1, 300);
PRAGMA user_version = 3;
`;

it('repairs the native early-v3 missing-generation error without changing saved times or other data', async () => {
  const { sqlite, adapter } = createTestDatabase(EARLY_V3);
  try {
    expect(() =>
      sqlite.prepare('SELECT generation FROM fatigue_state').get(),
    ).toThrow('no such column: generation');
    await runMigrations(adapter);
    expect(sqlite.prepare('SELECT * FROM fatigue_state').get()).toEqual({
      id: 1,
      woke_at: 200,
      revision: 1,
      updated_at: 300,
      generation: expect.stringMatching(/^[a-f0-9]{32}$/),
    });
    expect(sqlite.prepare('SELECT * FROM sleep_entries').get()).toEqual({
      id: 'sleep',
      slept_at: 100,
      woke_at: 200,
      created_at: 300,
      updated_at: 300,
    });
    expect(sqlite.prepare('SELECT id FROM daily_checks').get()).toEqual({
      id: 'legacy',
    });
    expect(sqlite.prepare('SELECT id FROM work_sessions').get()).toEqual({
      id: 'work',
    });
    expect(sqlite.prepare('PRAGMA user_version').get()).toEqual({
      user_version: SCHEMA_VERSION,
    });
    const token = sqlite.prepare('SELECT generation FROM fatigue_state').get();
    await runMigrations(adapter);
    expect(
      sqlite.prepare('SELECT generation FROM fatigue_state').get(),
    ).toEqual(token);
  } finally {
    sqlite.close();
  }
});

it('upgrades the complete v3 schema while retaining its existing generation', async () => {
  const { sqlite, adapter } = createTestDatabase(
    SCHEMA_SQL +
      "INSERT INTO fatigue_state VALUES (1, 200, 1, 'existing-token', 300); PRAGMA user_version = 3;",
  );
  try {
    await runMigrations(adapter);
    expect(
      sqlite.prepare('SELECT generation FROM fatigue_state').get(),
    ).toEqual({ generation: 'existing-token' });
  } finally {
    sqlite.close();
  }
});

it('repairs a database already labelled v4 when its actual table still lacks generation', async () => {
  const { sqlite, adapter } = createTestDatabase(
    EARLY_V3 + 'PRAGMA user_version = 4;',
  );
  try {
    await runMigrations(adapter);
    expect(
      sqlite.prepare('SELECT woke_at, generation FROM fatigue_state').get(),
    ).toEqual({
      woke_at: 200,
      generation: expect.stringMatching(/^[a-f0-9]{32}$/),
    });
    expect(sqlite.prepare('SELECT id FROM sleep_entries').get()).toEqual({
      id: 'sleep',
    });
    expect(sqlite.prepare('PRAGMA user_version').get()).toEqual({
      user_version: 4,
    });
  } finally {
    sqlite.close();
  }
});

it('rolls back the added generation column if repairing v3 fails, then retries', async () => {
  const { sqlite, adapter } = createTestDatabase(EARLY_V3);
  const execute = adapter.execAsync;
  try {
    adapter.execAsync = async (sql) => {
      await execute(sql);
      if (sql.includes('ALTER TABLE fatigue_state'))
        throw new Error('disk full');
    };
    await expect(runMigrations(adapter)).rejects.toThrow('disk full');
    expect(sqlite.prepare('PRAGMA user_version').get()).toEqual({
      user_version: 3,
    });
    expect(() =>
      sqlite.prepare('SELECT generation FROM fatigue_state').get(),
    ).toThrow('no such column: generation');
    expect(sqlite.prepare('SELECT woke_at FROM fatigue_state').get()).toEqual({
      woke_at: 200,
    });
    adapter.execAsync = execute;
    await runMigrations(adapter);
    expect(sqlite.prepare('PRAGMA user_version').get()).toEqual({
      user_version: SCHEMA_VERSION,
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
