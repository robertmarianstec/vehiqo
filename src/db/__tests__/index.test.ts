import type * as SQLite from 'expo-sqlite';

import { createTestDatabase } from '@/test/sqlite';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('@/db/migrations', () => ({ runMigrations: jest.fn() }));
jest.mock('@/db/schema', () => ({
  ...jest.requireActual<typeof import('@/db/schema')>('@/db/schema'),
  SCHEMA_VERSION: 3,
}));

beforeEach(() => jest.resetModules());

it('shares one database initialization across concurrent callers', async () => {
  const sqlite = jest.requireMock<typeof import('expo-sqlite')>('expo-sqlite');
  const migrations =
    jest.requireMock<typeof import('@/db/migrations')>('@/db/migrations');
  const { getDatabase } = jest.requireActual<typeof import('@/db')>('@/db');
  const db = {
    execAsync: jest.fn(),
    closeAsync: jest.fn(),
  } as unknown as SQLite.SQLiteDatabase;
  let resolve!: (db: SQLite.SQLiteDatabase) => void;
  jest.mocked(sqlite.openDatabaseAsync).mockReturnValue(
    new Promise((complete) => {
      resolve = complete;
    }),
  );
  const first = getDatabase(),
    second = getDatabase();
  expect(sqlite.openDatabaseAsync).toHaveBeenCalledTimes(1);
  resolve(db);
  expect(await first).toBe(db);
  expect(await second).toBe(db);
  expect(migrations.runMigrations).toHaveBeenCalledTimes(1);
  expect(await getDatabase()).toBe(db);
});

it('closes a failed connection and allows initialization to be retried', async () => {
  const sqlite = jest.requireMock<typeof import('expo-sqlite')>('expo-sqlite');
  const migrations =
    jest.requireMock<typeof import('@/db/migrations')>('@/db/migrations');
  const { getDatabase } = jest.requireActual<typeof import('@/db')>('@/db');
  const db = {
    execAsync: jest.fn(),
    closeAsync: jest.fn(),
  } as unknown as SQLite.SQLiteDatabase;
  jest.mocked(sqlite.openDatabaseAsync).mockResolvedValue(db);
  jest
    .mocked(migrations.runMigrations)
    .mockRejectedValueOnce(new Error('migration failed'))
    .mockResolvedValue(undefined);
  await expect(getDatabase()).rejects.toThrow('migration failed');
  expect(db.closeAsync).toHaveBeenCalledTimes(1);
  await expect(getDatabase()).resolves.toBe(db);
  expect(sqlite.openDatabaseAsync).toHaveBeenCalledTimes(2);
});

it('migrates the cached early-v3 connection when the schema version changes without reopening SQLite', async () => {
  const sqlite = jest.requireMock<typeof import('expo-sqlite')>('expo-sqlite');
  const migrations =
    jest.requireMock<typeof import('@/db/migrations')>('@/db/migrations');
  const schema = jest.requireMock<{ SCHEMA_VERSION: number }>('@/db/schema');
  const actual =
    jest.requireActual<typeof import('@/db/migrations')>('@/db/migrations');
  const { getDatabase } = jest.requireActual<typeof import('@/db')>('@/db');
  const test = createTestDatabase(
    `CREATE TABLE fatigue_state (id INTEGER PRIMARY KEY, woke_at INTEGER, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL); INSERT INTO fatigue_state VALUES (1, 200, 1, 300); PRAGMA user_version = 3;`,
  );
  try {
    jest.mocked(sqlite.openDatabaseAsync).mockResolvedValue(test.adapter);
    jest
      .mocked(migrations.runMigrations)
      .mockImplementation(actual.runMigrations)
      .mockResolvedValueOnce(undefined);
    expect(await getDatabase()).toBe(test.adapter);
    expect(() =>
      test.sqlite.prepare('SELECT generation FROM fatigue_state').get(),
    ).toThrow('no such column');
    schema.SCHEMA_VERSION = 4;
    const connections = await Promise.all([getDatabase(), getDatabase()]);
    expect(connections).toEqual([test.adapter, test.adapter]);
    expect(sqlite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(migrations.runMigrations).toHaveBeenCalledTimes(2);
    expect(
      test.sqlite
        .prepare('SELECT woke_at, generation FROM fatigue_state')
        .get(),
    ).toEqual({
      woke_at: 200,
      generation: expect.stringMatching(/^[a-f0-9]{32}$/),
    });
  } finally {
    test.sqlite.close();
  }
});

it('does not return a cached handle after its new migration fails and allows a safe retry', async () => {
  const sqlite = jest.requireMock<typeof import('expo-sqlite')>('expo-sqlite');
  const migrations =
    jest.requireMock<typeof import('@/db/migrations')>('@/db/migrations');
  const schema = jest.requireMock<{ SCHEMA_VERSION: number }>('@/db/schema');
  const { getDatabase } = jest.requireActual<typeof import('@/db')>('@/db');
  const db = {
    execAsync: jest.fn(),
    closeAsync: jest.fn(),
  } as unknown as SQLite.SQLiteDatabase;
  jest.mocked(sqlite.openDatabaseAsync).mockResolvedValue(db);
  jest.mocked(migrations.runMigrations).mockResolvedValue(undefined);
  await getDatabase();
  schema.SCHEMA_VERSION = 4;
  jest
    .mocked(migrations.runMigrations)
    .mockRejectedValueOnce(new Error('migration failed'));
  await expect(getDatabase()).rejects.toThrow('migration failed');
  await expect(getDatabase()).resolves.toBe(db);
  expect(sqlite.openDatabaseAsync).toHaveBeenCalledTimes(1);
  expect(db.closeAsync).not.toHaveBeenCalled();
});
