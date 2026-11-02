import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { getDatabase } from '@/db';
import { getCurrentWorkSession, getWorkSessionsInRange } from '@/db/queries';
import { SCHEMA_SQL } from '@/db/schema';
import type { WorkMode } from '@/db/types';
import { useWorkTimer } from '@/hooks/useWorkTimer';
import { getDayBounds } from '@/utils/dayTimeline';
import { formatDuration } from '@/utils/format';
import { getWorkReportDays } from '@/utils/workReport';

jest.mock('@/db', () => ({
  getDatabase: jest.fn(),
  WebDatabaseUnavailableError: class extends Error {},
}));
jest.mock('@/utils/id', () => {
  let nextId = 0;
  return { generateId: () => `mode-session-${++nextId}` };
});

const HOUR = 3_600_000;
const NOW = new Date(2026, 5, 17, 12).getTime();
const DRIVING_START = NOW - HOUR;
const MODES: WorkMode[] = ['driving', 'other_work', 'standby', 'break', 'rest'];
let sqlite: DatabaseSync;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA_SQL);
  // Keep the production queries and transactions; replace only the native bridge.
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
  const insert = sqlite.prepare(
    `INSERT INTO work_sessions
      (id, mode, started_at, ended_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?);`,
  );
  insert.run(
    'previous-rest',
    'rest',
    DRIVING_START - 9 * HOUR,
    DRIVING_START,
    DRIVING_START - 9 * HOUR,
    DRIVING_START,
  );
  insert.run(
    'current-driving',
    'driving',
    DRIVING_START,
    null,
    DRIVING_START,
    DRIVING_START,
  );
});

afterEach(() => {
  sqlite.close();
  jest.useRealTimers();
});

async function loadTimer() {
  const hook = await renderHook(useWorkTimer);
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  expect(hook.result.current.loadError).toBe(false);
  return hook;
}

it.each(MODES)(
  'records, reports and restores %s without adding other activities to driving',
  async (mode) => {
    const { result, unmount } = await loadTimer();
    expect(result.current.currentMode).toBe('driving');
    const pressedAt = Date.now();
    await act(() => result.current.switchMode(mode));
    expect(result.current.currentMode).toBe(mode);
    await act(() => jest.advanceTimersByTime(61_000));
    const asOf = Date.now();
    const active = await getCurrentWorkSession();
    const activeStart = mode === 'driving' ? DRIVING_START : pressedAt;
    expect(active).toMatchObject({
      mode,
      started_at: activeStart,
      ended_at: null,
    });
    expect(result.current.todaySegments).toContainEqual({
      mode,
      start: activeStart,
      end: asOf,
    });

    const expectedDriving =
      (mode === 'driving' ? asOf : pressedAt) - DRIVING_START;
    expect(result.current.counters).toEqual({
      drivingSinceBreak: expectedDriving,
      dailyDriving: expectedDriving,
      weeklyDriving: expectedDriving,
      biweeklyDriving: expectedDriving,
    });

    const { dayStart, dayEnd } = getDayBounds(asOf);
    const sessions = await getWorkSessionsInRange(dayStart, asOf);
    expect(sessions).toHaveLength(mode === 'driving' ? 2 : 3);
    expect(sessions.filter((session) => session.ended_at === null)).toEqual([
      active,
    ]);
    if (mode === 'driving') expect(active?.id).toBe('current-driving');
    const [day] = getWorkReportDays(sessions, dayStart, dayEnd, asOf);
    const previousModeTime = mode === 'rest' ? 9 * HOUR : 0;
    const expectedModeTime =
      mode === 'driving'
        ? expectedDriving
        : previousModeTime + asOf - pressedAt;
    expect(day.durations[mode]).toBe(expectedModeTime);
    expect(day.durations.driving).toBe(expectedDriving);
    expect(formatDuration(asOf - activeStart)).toBe(
      mode === 'driving' ? '01:01' : '00:01',
    );

    const beforeReload = result.current.counters;
    await unmount();
    const restored = await loadTimer();
    expect(restored.result.current.currentMode).toBe(mode);
    expect(restored.result.current.counters).toEqual(beforeReload);
    expect(restored.result.current.todaySegments).toContainEqual({
      mode,
      start: activeStart,
      end: asOf,
    });
    expect(await getCurrentWorkSession()).toEqual(active);
    await restored.unmount();
  },
);
