import {
  FatigueError,
  validateFatigueSnapshot,
  validateFatigueTime,
} from '@/utils/fatigue';
import { generateId } from '@/utils/id';

import { getDatabase } from './index';
import { runMigrations } from './migrations';
import { queueOperation } from './queue';
import type { FatigueAction, FatigueSnapshot, SleepEntry } from './types';

type Database = Awaited<ReturnType<typeof getDatabase>>;

async function read(db: Database, now: number): Promise<FatigueSnapshot> {
  const state = await db.getFirstAsync<{
    woke_at: number | null;
    revision: number;
    generation: string;
    updated_at: number;
  }>(
    'SELECT woke_at, revision, generation, updated_at FROM fatigue_state WHERE id = 1;',
  );
  const entries = await db.getAllAsync<SleepEntry>(
    'SELECT * FROM sleep_entries ORDER BY slept_at, id;',
  );
  const snapshot = {
    entries,
    wokeAt: state?.woke_at ?? null,
    revision: state?.revision ?? 0,
    generation: state?.generation ?? null,
    updatedAt: state?.updated_at ?? 0,
  };
  validateFatigueSnapshot(snapshot, now);
  return snapshot;
}

export function getFatigueSnapshot(): Promise<FatigueSnapshot> {
  return queueOperation(async () => {
    const db = await getDatabase();
    try {
      return await read(db, Date.now());
    } catch (error) {
      // Fast Refresh may retain an open handle to the earlier table shape.
      const message =
        error !== null &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
          ? error.message
          : String(error);
      if (!/no such column: generation\b/.test(message)) throw error;
      await runMigrations(db);
      return read(db, Date.now());
    }
  });
}

export function saveFatigueAction(
  action: FatigueAction,
  expectedRevision: number,
  expectedGeneration: string | null,
): Promise<FatigueSnapshot> {
  const requested = { ...action };
  return queueOperation(async () => {
    const db = await getDatabase();
    let result!: FatigueSnapshot;
    await db.withTransactionAsync(async () => {
      const now = Date.now();
      const snapshot = await read(db, now);
      if (
        snapshot.revision !== expectedRevision ||
        snapshot.generation !== expectedGeneration
      )
        throw new FatigueError('stale');
      const open = snapshot.entries.find((entry) => entry.woke_at === null);
      let wokeAt = snapshot.wokeAt;
      const insert = (from: number, to: number | null) =>
        db.runAsync(
          'INSERT INTO sleep_entries (id, slept_at, woke_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?);',
          generateId(),
          from,
          to,
          now,
          now,
        );
      if (requested.type === 'addSleep') {
        validateFatigueTime(requested.from, now);
        validateFatigueTime(requested.to, now);
        if (requested.from >= requested.to)
          throw new FatigueError('invalidOrder');
        if (
          snapshot.entries.some(
            (entry) =>
              requested.from < (entry.woke_at ?? Infinity) &&
              requested.to > entry.slept_at,
          )
        )
          throw new FatigueError('overlap');
        if (!open && wokeAt !== null && requested.to > wokeAt)
          throw new FatigueError('afterWake');
        await insert(requested.from, requested.to);
        if (wokeAt === null || (open && requested.to > wokeAt))
          wokeAt = requested.to;
      } else {
        validateFatigueTime(requested.at, now);
        if (requested.type === 'sleep') {
          if (open || wokeAt === null) throw new FatigueError('invalidState');
          if (requested.at < wokeAt) throw new FatigueError('invalidOrder');
          await insert(requested.at, null);
        } else if (requested.type === 'wake') {
          if (!open && wokeAt !== null) throw new FatigueError('stale');
          if (open) {
            if (requested.at <= open.slept_at)
              throw new FatigueError('invalidOrder');
            await db.runAsync(
              'UPDATE sleep_entries SET woke_at = ?, updated_at = ? WHERE id = ?;',
              requested.at,
              now,
              open.id,
            );
          }
          wokeAt = requested.at;
        } else {
          if (open || wokeAt === null) throw new FatigueError('invalidState');
          const paired = snapshot.entries.find(
            (entry) => entry.woke_at === wokeAt,
          );
          const others = snapshot.entries.filter((entry) => entry !== paired);
          if (
            (paired && requested.at <= paired.slept_at) ||
            others.some((entry) => entry.woke_at! > requested.at)
          )
            throw new FatigueError('invalidOrder');
          if (paired)
            await db.runAsync(
              'UPDATE sleep_entries SET woke_at = ?, updated_at = ? WHERE id = ?;',
              requested.at,
              now,
              paired.id,
            );
          wokeAt = requested.at;
        }
      }
      await db.runAsync(
        'INSERT INTO fatigue_state (id, woke_at, revision, generation, updated_at) VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET woke_at = excluded.woke_at, revision = excluded.revision, updated_at = excluded.updated_at;',
        wokeAt,
        snapshot.revision + 1,
        snapshot.generation ?? generateId(),
        now,
      );
      result = await read(db, now);
    });
    return result;
  });
}
