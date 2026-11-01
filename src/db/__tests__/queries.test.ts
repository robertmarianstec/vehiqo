import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { getDatabase } from '@/db';
import {
  getCurrentWorkSession,
  getWorkSessionsInRange,
  getWorkTimerSettings,
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

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA_SQL);
  // Execute the production SQL against SQLite; only the native bridge is replaced.
  const adapter = {
    getFirstAsync: async (sql: string, ...params: SQLInputValue[]) =>
      sqlite.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql: string, ...params: SQLInputValue[]) =>
      sqlite.prepare(sql).all(...params),
    runAsync: async (sql: string, ...params: SQLInputValue[]) =>
      sqlite.prepare(sql).run(...params),
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

describe('work session persistence', () => {
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
