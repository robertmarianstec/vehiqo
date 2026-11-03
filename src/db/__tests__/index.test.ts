import type * as SQLite from 'expo-sqlite';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('@/db/migrations', () => ({ runMigrations: jest.fn() }));

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
