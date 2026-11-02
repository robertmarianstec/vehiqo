import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { getDatabase } from '@/db';
import {
  clearAllLocalData,
  getCurrentWorkSession,
  getThemePreference,
  getWorkSessionsInRange,
  getWorkTimerSettings,
  setThemePreference,
  startWorkSession,
} from '@/db/queries';
import { SCHEMA_SQL } from '@/db/schema';
import type { WorkMode } from '@/db/types';

jest.mock('@/db', () => ({
  getDatabase: jest.fn(),
  WebDatabaseUnavailableError: class extends Error {},
}));
jest.mock('@/utils/id', () => {
  let nextId = 0;
  return { generateId: () => `session-${++nextId}` };
});

const HOUR = 3_600_000;
const NOW = new Date(2026, 5, 17, 12).getTime();
let sqlite: DatabaseSync;
let beforeRun: ((sql: string) => Promise<void>) | undefined;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  beforeRun = undefined;
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA_SQL);
  // Execute the production SQL against SQLite; only the native bridge is replaced.
  const adapter = {
    getFirstAsync: async (sql: string, ...params: SQLInputValue[]) =>
      sqlite.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql: string, ...params: SQLInputValue[]) =>
      sqlite.prepare(sql).all(...params),
    runAsync: async (sql: string, ...params: SQLInputValue[]) => {
      await beforeRun?.(sql);
      return sqlite.prepare(sql).run(...params);
    },
    withTransactionAsync: async (task: () => Promise<void>) => {
      sqlite.exec('BEGIN');
      try {
        await task();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  jest
    .mocked(getDatabase)
    .mockResolvedValue(
      adapter as unknown as Awaited<ReturnType<typeof getDatabase>>,
    );
});

afterEach(() => {
  sqlite.close();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function seed(mode: WorkMode, start: number, end: number | null) {
  sqlite
    .prepare(
      `INSERT INTO work_sessions
    (id, mode, started_at, ended_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(`${mode}-${start}`, mode, start, end, start, end ?? start);
}

describe('work timer rest metadata', () => {
  it.each([
    '',
    ' ',
    'invalid',
    'NaN',
    'Infinity',
    '-1',
    '1.5',
    '1e3',
    String(NOW + 1),
    String(Number.MAX_SAFE_INTEGER + 1),
  ])(
    'rejects invalid or future daily and weekly rest timestamps %j',
    async (value) => {
      for (const key of ['last_daily_rest_end', 'last_weekly_rest_end']) {
        sqlite
          .prepare(
            'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
          )
          .run(key, value, NOW);
        await expect(getWorkTimerSettings()).rejects.toThrow();
        sqlite.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
      }
    },
  );

  it('accepts zero and current timestamps without treating zero as missing', async () => {
    sqlite
      .prepare(
        "INSERT INTO app_settings (key, value, updated_at) VALUES ('last_daily_rest_end', '0', ?)",
      )
      .run(NOW);
    sqlite
      .prepare(
        "INSERT INTO app_settings (key, value, updated_at) VALUES ('last_weekly_rest_end', ?, ?)",
      )
      .run(String(NOW), NOW);
    expect(await getWorkTimerSettings()).toEqual({
      lastDailyRestEnd: 0,
      lastWeeklyRestEnd: NOW,
    });
  });
});

describe('work session persistence', () => {
  it.each(['driving', 'rest'] as const)(
    'rejects a %s selection before the active session start without changing history',
    async (mode) => {
      seed('rest', NOW, null);
      jest.setSystemTime(NOW - 1);
      await expect(startWorkSession(mode)).rejects.toThrow();
      expect(
        sqlite
          .prepare('SELECT mode, started_at, ended_at FROM work_sessions')
          .all(),
      ).toEqual([{ mode: 'rest', started_at: NOW, ended_at: null }]);
      jest.setSystemTime(NOW);
      await expect(startWorkSession('driving')).resolves.toMatchObject({
        mode: 'driving',
        started_at: NOW,
      });
    },
  );

  it('rejects a new session before the last closed endpoint when no session is active', async () => {
    seed('driving', NOW - HOUR, NOW);
    jest.setSystemTime(NOW - 1);
    await expect(startWorkSession('other_work')).rejects.toThrow();
    expect(await getCurrentWorkSession()).toBeNull();
    expect(
      sqlite.prepare('SELECT COUNT(*) AS count FROM work_sessions').get(),
    ).toEqual({ count: 1 });
  });

  it('allows a new session exactly at the last closed endpoint', async () => {
    seed('driving', NOW - HOUR, NOW);
    await expect(startWorkSession('other_work')).resolves.toMatchObject({
      mode: 'other_work',
      started_at: NOW,
    });
  });

  it('checks queued press times against the history committed ahead of them', async () => {
    seed('driving', NOW - HOUR, null);
    const first = startWorkSession('break');
    jest.setSystemTime(NOW - 1);
    const second = startWorkSession('other_work');
    const results = await Promise.allSettled([first, second]);
    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect((await getCurrentWorkSession())?.mode).toBe('break');
    expect(
      sqlite
        .prepare(
          'SELECT mode, started_at, ended_at FROM work_sessions ORDER BY rowid',
        )
        .all(),
    ).toEqual([
      { mode: 'driving', started_at: NOW - HOUR, ended_at: NOW },
      { mode: 'break', started_at: NOW, ended_at: null },
    ]);
  });

  it.each([NaN, Infinity, -1, 1.5])(
    'rejects an invalid press timestamp %s before writing',
    async (time) => {
      jest.spyOn(Date, 'now').mockReturnValue(time);
      await expect(startWorkSession('driving')).rejects.toThrow();
      expect(
        sqlite.prepare('SELECT COUNT(*) AS count FROM work_sessions').get(),
      ).toEqual({ count: 0 });
    },
  );

  it.each([false, true])(
    'reads current mode and rest settings only after a pending write settles (rollback: %s)',
    async (rollback) => {
      seed('rest', NOW - 24 * HOUR, null);
      if (rollback) {
        sqlite.exec(`CREATE TRIGGER reject_driving BEFORE INSERT ON work_sessions
          WHEN NEW.mode = 'driving' BEGIN SELECT RAISE(ABORT, 'test write failure'); END;`);
      }
      let release!: () => void;
      let reached!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        reached = resolve;
      });
      beforeRun = async (sql) => {
        if (sql.includes('INSERT INTO work_sessions')) {
          reached();
          await gate;
        }
      };
      const change = startWorkSession('driving');
      const settled = Promise.allSettled([change]);
      await entered;
      let readsSettled = false;
      const reads = Promise.all([
        getCurrentWorkSession(),
        getWorkSessionsInRange(NOW - 25 * HOUR, NOW + 1),
        getWorkTimerSettings(),
      ]).then((snapshot) => {
        readsSettled = true;
        return snapshot;
      });
      // Give each query time to reach SQLite while the transaction is paused.
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      const settledBeforeCommit = readsSettled;
      release();
      await settled;
      const [current, history, settings] = await reads;
      expect(settledBeforeCommit).toBe(false);
      expect(current?.mode).toBe(rollback ? 'rest' : 'driving');
      expect(history.filter((session) => session.ended_at === null)).toEqual([
        current,
      ]);
      expect(settings).toEqual({
        lastDailyRestEnd: rollback ? null : NOW,
        lastWeeklyRestEnd: rollback ? null : NOW,
      });
    },
  );

  it('reads a theme only after an already requested save finishes', async () => {
    const save = setThemePreference('dark');
    const read = getThemePreference();
    await save;
    expect(await read).toBe('dark');
  });

  it('keeps the operation queue usable after a read fails', async () => {
    jest.mocked(getDatabase).mockRejectedValueOnce(new Error('read failed'));
    await expect(getWorkTimerSettings()).rejects.toThrow('read failed');
    await startWorkSession('driving');
    expect((await getCurrentWorkSession())?.mode).toBe('driving');
  });

  it('does not expose an uncommitted rest end to a report read', async () => {
    seed('rest', NOW - 24 * HOUR, null);
    sqlite.exec(`CREATE TRIGGER reject_driving BEFORE INSERT ON work_sessions
      WHEN NEW.mode = 'driving' BEGIN SELECT RAISE(ABORT, 'test write failure'); END;`);
    const change = startWorkSession('driving');
    await Promise.resolve();
    await Promise.resolve();
    const read = getWorkSessionsInRange(NOW - 25 * HOUR, NOW);
    await Promise.allSettled([change]);
    expect((await read)[0].ended_at).toBeNull();
  });

  it('finishes queued mode writes before clearing local data', async () => {
    seed('driving', NOW - HOUR, null);
    await Promise.all([startWorkSession('break'), clearAllLocalData()]);
    expect(await getCurrentWorkSession()).toBeNull();
    expect(await getWorkSessionsInRange(NOW - 2 * HOUR, NOW + 1)).toEqual([]);
    expect(await getWorkTimerSettings()).toEqual({
      lastDailyRestEnd: null,
      lastWeeklyRestEnd: null,
    });
  });

  it('preserves a concurrent theme save when the mode change rolls back', async () => {
    seed('rest', NOW - 24 * HOUR, null);
    sqlite.exec(`CREATE TRIGGER reject_driving BEFORE INSERT ON work_sessions
      WHEN NEW.mode = 'driving' BEGIN SELECT RAISE(ABORT, 'test write failure'); END;`);
    const mode = startWorkSession('driving');
    await Promise.resolve();
    await Promise.resolve();
    const theme = setThemePreference('dark');
    const results = await Promise.allSettled([mode, theme]);
    expect(results.map((result) => result.status)).toEqual([
      'rejected',
      'fulfilled',
    ]);
    expect(await getThemePreference()).toBe('dark');
    expect((await getCurrentWorkSession())?.mode).toBe('rest');
  });

  it.each([
    { duration: 9 * HOUR - 1, daily: null, weekly: null },
    { duration: 9 * HOUR, daily: NOW, weekly: null },
    { duration: 24 * HOUR - 1, daily: NOW, weekly: null },
    { duration: 24 * HOUR, daily: NOW, weekly: NOW },
  ])(
    'checks exact rest thresholds for $duration ms',
    async ({ duration, daily, weekly }) => {
      seed('rest', NOW - duration, null);
      await startWorkSession('driving');
      expect(await getWorkTimerSettings()).toEqual({
        lastDailyRestEnd: daily,
        lastWeeklyRestEnd: weekly,
      });
    },
  );

  it('does not mistake an earlier qualifying rest for the short rest just ended', async () => {
    seed('rest', NOW - 12 * HOUR, NOW - 3 * HOUR);
    seed('other_work', NOW - 3 * HOUR, NOW - HOUR);
    seed('rest', NOW - HOUR, null);
    await startWorkSession('driving');
    expect((await getWorkTimerSettings()).lastDailyRestEnd).toBeNull();
  });

  it.each([
    { hours: 9, parts: [5, 4], daily: NOW, weekly: null },
    { hours: 24, parts: [12, 12], daily: NOW, weekly: NOW },
    { hours: 30, parts: [20, 10], daily: NOW, weekly: NOW },
  ])(
    'records the end of a continuous $hours-hour rest',
    async ({ parts, daily, weekly }) => {
      const split = NOW - parts[1] * HOUR;
      seed('rest', split - parts[0] * HOUR, split);
      seed('rest', split, null);
      const next = await startWorkSession('driving');
      expect(await getWorkTimerSettings()).toEqual({
        lastDailyRestEnd: daily,
        lastWeeklyRestEnd: weekly,
      });
      expect(await getCurrentWorkSession()).toEqual(next);
      expect(
        (await getWorkSessionsInRange(NOW - 40 * HOUR, NOW + 1)).filter(
          (s) => s.ended_at === null,
        ),
      ).toEqual([next]);
    },
  );

  it.each(['other_work', 'standby', 'driving', 'break'] as const)(
    'does not join rests separated by %s',
    async (mode) => {
      seed('rest', NOW - 10 * HOUR, NOW - 5 * HOUR);
      seed(mode, NOW - 5 * HOUR, NOW - 4 * HOUR);
      seed('rest', NOW - 4 * HOUR, null);
      await startWorkSession('driving');
      expect(await getWorkTimerSettings()).toEqual({
        lastDailyRestEnd: null,
        lastWeeklyRestEnd: null,
      });
    },
  );

  it('does not join rests separated by a gap', async () => {
    seed('rest', NOW - 10 * HOUR, NOW - 4 * HOUR - 1);
    seed('rest', NOW - 4 * HOUR, null);
    await startWorkSession('driving');
    expect((await getWorkTimerSettings()).lastDailyRestEnd).toBeNull();
  });

  it.each(['driving', 'other_work', 'standby', 'break', 'rest'] as const)(
    'keeps the existing %s record when the selected mode is pressed again',
    async (mode) => {
      seed(mode, NOW - 10 * HOUR, null);
      const before = await getCurrentWorkSession();
      expect(await startWorkSession(mode)).toEqual(before);
      expect(await getWorkSessionsInRange(NOW - 11 * HOUR, NOW + 1)).toEqual([
        before,
      ]);
      expect((await getWorkTimerSettings()).lastDailyRestEnd).toBeNull();
    },
  );

  it('serializes rapid mode changes without overlapping transactions', async () => {
    seed('driving', NOW - HOUR, null);
    const results = await Promise.allSettled([
      startWorkSession('break'),
      startWorkSession('rest'),
      startWorkSession('other_work'),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ]);
    expect((await getCurrentWorkSession())?.mode).toBe('other_work');
    const history = await getWorkSessionsInRange(NOW - 2 * HOUR, NOW + 1);
    expect(history.filter((session) => session.ended_at === null)).toHaveLength(
      1,
    );
    expect(
      sqlite.prepare('SELECT mode FROM work_sessions ORDER BY rowid').all(),
    ).toEqual([
      { mode: 'driving' },
      { mode: 'break' },
      { mode: 'rest' },
      { mode: 'other_work' },
    ]);
  });

  it('records each press time even when the writes wait in the queue', async () => {
    seed('driving', NOW - HOUR, null);
    const first = startWorkSession('break');
    jest.setSystemTime(NOW + 1_000);
    const second = startWorkSession('rest');
    jest.setSystemTime(NOW + 2_000);
    expect((await first).started_at).toBe(NOW);
    expect((await second).started_at).toBe(NOW + 1_000);
    expect(
      sqlite
        .prepare("SELECT ended_at FROM work_sessions WHERE mode = 'break'")
        .get(),
    ).toEqual({ ended_at: NOW + 1_000 });
  });

  it('rolls back the closed record and rest metadata if insertion fails, then allows retry', async () => {
    seed('rest', NOW - 24 * HOUR, null);
    sqlite.exec(`CREATE TRIGGER reject_driving BEFORE INSERT ON work_sessions
      WHEN NEW.mode = 'driving' BEGIN SELECT RAISE(ABORT, 'test write failure'); END;`);
    await expect(startWorkSession('driving')).rejects.toThrow(
      'test write failure',
    );
    expect((await getCurrentWorkSession())?.mode).toBe('rest');
    expect(await getWorkTimerSettings()).toEqual({
      lastDailyRestEnd: null,
      lastWeeklyRestEnd: null,
    });
    sqlite.exec('DROP TRIGGER reject_driving');
    await expect(startWorkSession('driving')).resolves.toMatchObject({
      mode: 'driving',
    });
    expect(await getWorkTimerSettings()).toEqual({
      lastDailyRestEnd: NOW,
      lastWeeklyRestEnd: NOW,
    });
  });
});
