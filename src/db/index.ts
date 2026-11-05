import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { runMigrations } from './migrations';
import { SCHEMA_VERSION } from './schema';

const DB_NAME = 'vehiqo.db';

// On web the OPFS Web Worker backing expo-sqlite can silently fail to start on
// the dev server, leaving openDatabaseAsync pending forever. The browser is a
// UI-preview target only — the phone uses native SQLite as the real source of
// truth — so we cap the wait and give up cleanly instead of hanging the UI.
const WEB_INIT_TIMEOUT_MS = 4000;

/**
 * Raised only in the web preview, when expo-sqlite's OPFS worker never starts.
 * Callers catch this specific type to fall back to a UI-only state; on native
 * a database is always available, so it never fires there.
 */
export class WebDatabaseUnavailableError extends Error {
  constructor() {
    super('SQLite is unavailable in the web preview');
    this.name = 'WebDatabaseUnavailableError';
  }
}

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initializing: Promise<SQLite.SQLiteDatabase> | null = null;
let migratedVersion: number | null = null;
let webUnavailable = false;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (initializing) return initializing;
  if (dbInstance && migratedVersion === SCHEMA_VERSION) return dbInstance;
  if (Platform.OS === 'web' && webUnavailable) {
    throw new WebDatabaseUnavailableError();
  }
  const existing = dbInstance;
  initializing = (async () => {
    try {
      if (existing) {
        await runMigrations(existing);
        migratedVersion = SCHEMA_VERSION;
        return existing;
      }
      dbInstance =
        Platform.OS === 'web'
          ? await Promise.race([openAndMigrate(), rejectAfterWebTimeout()])
          : await openAndMigrate();
      migratedVersion = SCHEMA_VERSION;
      return dbInstance;
    } catch (e) {
      if (Platform.OS === 'web') {
        webUnavailable = true;
        throw new WebDatabaseUnavailableError();
      }
      throw e;
    } finally {
      initializing = null;
    }
  })();
  return initializing;
}

function rejectAfterWebTimeout(): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(
      () => reject(new WebDatabaseUnavailableError()),
      WEB_INIT_TIMEOUT_MS,
    ),
  );
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  try {
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await runMigrations(db);
    return db;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}
