import {
  DAILY_REST_REDUCED_MS,
  DRIVING_BEFORE_BREAK_MS,
  WEEKLY_REST_REDUCED_MS,
} from '@/constants/euRegulations';
import { generateId } from '@/utils/id';
import { getLastRestPeriodEnd } from '@/utils/workTime';

import { getDatabase, WebDatabaseUnavailableError } from './index';
import type { ThemePreference, WorkMode, WorkSession } from './types';

// Only the web preview can lack a database; read queries then fall back to a
// UI-only state so the browser still renders. Native always has SQLite, so this
// never fires there.
function isDbUnavailable(e: unknown): e is WebDatabaseUnavailableError {
  return e instanceof WebDatabaseUnavailableError;
}

// Dev-only preview aid: with no persistence on web the counters would sit at
// zero and never trip a warning, so seed an in-progress driving session at 95%
// of the pre-break limit (the "warning" band) to make the alert banner visible
// while eyeballing the UI. Gated on __DEV__ so no production build can ship it.
function buildWebDemoDrivingSession(): WorkSession | null {
  if (!__DEV__) return null;
  const startedAt = Date.now() - Math.round(DRIVING_BEFORE_BREAK_MS * 0.95);
  return {
    id: 'web-demo-driving',
    mode: 'driving',
    started_at: startedAt,
    ended_at: null,
    created_at: startedAt,
    updated_at: startedAt,
    synced_at: null,
  };
}

export async function getCurrentWorkSession(): Promise<WorkSession | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<WorkSession>(
      `SELECT * FROM work_sessions
       WHERE ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1;`,
    );
    return row ?? null;
  } catch (e) {
    if (isDbUnavailable(e)) return buildWebDemoDrivingSession();
    throw e;
  }
}

// Writes on this connection must not enter another operation's transaction.
let pendingWrite: Promise<unknown> = Promise.resolve();

function queueWrite<T>(write: () => Promise<T>): Promise<T> {
  const next = pendingWrite.then(write);
  pendingWrite = next.catch(() => undefined);
  return next;
}

export function startWorkSession(mode: WorkMode): Promise<WorkSession> {
  const now = Date.now();
  return queueWrite(() => createWorkSession(mode, now));
}

async function createWorkSession(
  mode: WorkMode,
  now: number,
): Promise<WorkSession> {
  const id = generateId();

  let db: Awaited<ReturnType<typeof getDatabase>>;
  try {
    db = await getDatabase();
  } catch (e) {
    // Web preview without persistence: return an in-memory session so mode
    // switching still updates the UI. Nothing is saved — native persists.
    if (isDbUnavailable(e)) {
      return {
        id,
        mode,
        started_at: now,
        ended_at: null,
        created_at: now,
        updated_at: now,
        synced_at: null,
      };
    }
    throw e;
  }

  let existing: WorkSession | null = null;
  await db.withTransactionAsync(async () => {
    const prev = await db.getFirstAsync<WorkSession>(
      `SELECT * FROM work_sessions
       WHERE ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1;`,
    );

    if (prev?.mode === mode) {
      existing = prev;
      return;
    }

    await db.runAsync(
      `UPDATE work_sessions
       SET ended_at = ?, updated_at = ?
       WHERE ended_at IS NULL;`,
      now,
      now,
    );

    // Read overlapping records as well: a continuous rest can start before
    // this window or span several adjacent records. Weekly driving itself
    // remains a calendar-week total, independent of this rest metadata.
    if (prev?.mode === 'rest') {
      const history = await db.getAllAsync<WorkSession>(
        `SELECT * FROM work_sessions
         WHERE started_at <= ? AND ended_at >= ?
         ORDER BY started_at ASC;`,
        now,
        now - WEEKLY_REST_REDUCED_MS,
      );
      if (getLastRestPeriodEnd(history, DAILY_REST_REDUCED_MS, now) === now) {
        await db.runAsync(
          `INSERT OR REPLACE INTO app_settings (key, value, updated_at)
           VALUES ('last_daily_rest_end', ?, ?);`,
          String(now),
          now,
        );
      }
      if (getLastRestPeriodEnd(history, WEEKLY_REST_REDUCED_MS, now) === now) {
        await db.runAsync(
          `INSERT OR REPLACE INTO app_settings (key, value, updated_at)
           VALUES ('last_weekly_rest_end', ?, ?);`,
          String(now),
          now,
        );
      }
    }

    await db.runAsync(
      `INSERT INTO work_sessions (id, mode, started_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?);`,
      id,
      mode,
      now,
      now,
      now,
    );
  });

  return (
    existing ?? {
      id,
      mode,
      started_at: now,
      ended_at: null,
      created_at: now,
      updated_at: now,
      synced_at: null,
    }
  );
}

export async function getWorkSessionsInRange(
  from: number,
  to: number,
): Promise<WorkSession[]> {
  try {
    // Reports must not observe a mode change that can still roll back.
    await pendingWrite;
    const db = await getDatabase();
    return await db.getAllAsync<WorkSession>(
      `SELECT * FROM work_sessions
       WHERE started_at < ?
         AND (ended_at > ? OR ended_at IS NULL)
       ORDER BY started_at ASC;`,
      to,
      from,
    );
  } catch (e) {
    if (isDbUnavailable(e)) {
      const demo = buildWebDemoDrivingSession();
      return demo ? [demo] : [];
    }
    throw e;
  }
}

// Dev-only reset: wipes every locally stored row. Deletes through the already
// open connection rather than dropping the database file — deleting the file
// would leave the cached handle in db/index.ts pointing at a database that no
// longer exists, breaking every query until a full app restart. Children are
// cleared before parents so the order never depends on ON DELETE CASCADE.
export function clearAllLocalData(): Promise<void> {
  return queueWrite(clearLocalData);
}

async function clearLocalData(): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM daily_check_items;');
    await db.runAsync('DELETE FROM daily_checks;');
    await db.runAsync('DELETE FROM fatigue_sessions;');
    await db.runAsync('DELETE FROM work_sessions;');
    await db.runAsync('DELETE FROM app_settings;');
  });
}

const THEME_PREFERENCE_KEY = 'theme_preference';

function isThemePreference(
  value: string | undefined,
): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export async function getThemePreference(): Promise<ThemePreference> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = ?;`,
      THEME_PREFERENCE_KEY,
    );
    return isThemePreference(row?.value) ? row.value : 'system';
  } catch (e) {
    if (isDbUnavailable(e)) return 'system';
    throw e;
  }
}

export function setThemePreference(preference: ThemePreference): Promise<void> {
  return queueWrite(() => persistThemePreference(preference));
}

async function persistThemePreference(
  preference: ThemePreference,
): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?);`,
      THEME_PREFERENCE_KEY,
      preference,
      Date.now(),
    );
  } catch (e) {
    if (isDbUnavailable(e)) return;
    throw e;
  }
}

export interface WorkTimerSettings {
  lastDailyRestEnd: number | null;
  lastWeeklyRestEnd: number | null;
}

export async function getWorkTimerSettings(): Promise<WorkTimerSettings> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      `SELECT key, value FROM app_settings
       WHERE key IN ('last_daily_rest_end', 'last_weekly_rest_end');`,
    );

    const readTimestamp = (key: string): number | null => {
      const row = rows.find((r) => r.key === key);
      return row ? Number(row.value) : null;
    };

    return {
      lastDailyRestEnd: readTimestamp('last_daily_rest_end'),
      lastWeeklyRestEnd: readTimestamp('last_weekly_rest_end'),
    };
  } catch (e) {
    if (isDbUnavailable(e)) {
      return { lastDailyRestEnd: null, lastWeeklyRestEnd: null };
    }
    throw e;
  }
}
