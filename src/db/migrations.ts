import type { SQLiteDatabase } from 'expo-sqlite';

import {
  MIGRATION_2_SQL,
  MIGRATION_3_SQL,
  SCHEMA_SQL,
  SCHEMA_VERSION,
} from './schema';

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;',
  );
  const version = result?.user_version ?? 0;
  if (version > SCHEMA_VERSION) throw new Error('Unsupported database version');
  if (version === SCHEMA_VERSION) {
    const columns = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(fatigue_state);',
    );
    if (columns.some((column) => column.name === 'generation')) return;
  }
  await db.withTransactionAsync(async () => {
    if (version === 0) await db.execAsync(SCHEMA_SQL);
    else {
      if (version < 2) await db.execAsync(MIGRATION_2_SQL);
      if (version < 3) await db.execAsync(MIGRATION_3_SQL);
    }
    if (version <= 4) {
      // Fast Refresh exposed an early v3 table before generation was added.
      const columns = await db.getAllAsync<{ name: string }>(
        'PRAGMA table_info(fatigue_state);',
      );
      if (!columns.some((column) => column.name === 'generation'))
        await db.execAsync(
          "ALTER TABLE fatigue_state ADD COLUMN generation TEXT NOT NULL DEFAULT '';",
        );
      await db.execAsync(
        "UPDATE fatigue_state SET generation = lower(hex(randomblob(16))) WHERE generation IS NULL OR generation = '';",
      );
    }
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  });
}
