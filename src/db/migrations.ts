import type { SQLiteDatabase } from 'expo-sqlite';

import { MIGRATION_2_SQL, SCHEMA_SQL, SCHEMA_VERSION } from './schema';

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;',
  );
  const version = result?.user_version ?? 0;
  if (version > SCHEMA_VERSION) throw new Error('Unsupported database version');
  if (version === SCHEMA_VERSION) return;
  await db.withTransactionAsync(async () => {
    if (version === 0) await db.execAsync(SCHEMA_SQL);
    else if (version === 1) await db.execAsync(MIGRATION_2_SQL);
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  });
}
