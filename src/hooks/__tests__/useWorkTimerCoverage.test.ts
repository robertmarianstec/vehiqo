import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  getCurrentWorkSession,
  getWorkSessionsInRange,
  getWorkTimerSettings,
} from '@/db/queries';
import type { WorkMode, WorkSession } from '@/db/types';
import { useWorkTimer } from '@/hooks/useWorkTimer';

jest.mock('@/db/queries', () => ({
  getCurrentWorkSession: jest.fn(),
  getWorkSessionsInRange: jest.fn(),
  getWorkTimerSettings: jest.fn(),
  startWorkSession: jest.fn(),
}));

const HOUR = 3_600_000;
const NOW = new Date(2026, 10, 2, 12).getTime();
function session(
  mode: WorkMode,
  start: number,
  end: number | null = null,
): WorkSession {
  return {
    id: `${mode}-${start}`,
    mode,
    started_at: start,
    ended_at: end,
    created_at: start,
    updated_at: end ?? start,
    synced_at: null,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  jest
    .mocked(getWorkTimerSettings)
    .mockResolvedValue({ lastDailyRestEnd: null, lastWeeklyRestEnd: null });
});
afterEach(() => jest.useRealTimers());

async function load(sessions: WorkSession[], boundary: number | null = null) {
  jest
    .mocked(getCurrentWorkSession)
    .mockResolvedValue(sessions.find((row) => row.ended_at === null) ?? null);
  jest.mocked(getWorkSessionsInRange).mockResolvedValue(sessions);
  jest
    .mocked(getWorkTimerSettings)
    .mockResolvedValue({ lastDailyRestEnd: boundary, lastWeeklyRestEnd: null });
  const hook = await renderHook(useWorkTimer);
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

it('retains recorded driving across midnight without inventing a complete daily period', async () => {
  const start = new Date(2026, 10, 1, 22).getTime();
  const end = new Date(2026, 10, 2, 3).getTime();
  const { result } = await load([session('driving', start, end)]);
  expect(result.current.counters.dailyDriving).toBe(5 * HOUR);
  expect(result.current.dailyDrivingComplete).toBe(false);
  expect(result.current.dailyDrivingLimit).toBeNull();
  expect(result.current.warnings.dailyDriving).toBeNull();
  expect(
    result.current.alerts.some((alert) => alert.id === 'dailyDriving'),
  ).toBe(false);
  expect(getWorkSessionsInRange).toHaveBeenCalledWith(0, NOW);
});

it('does not treat a known current rest as proof of earlier weekly extension history', async () => {
  const now = new Date(2026, 10, 4, 12).getTime();
  jest.setSystemTime(now);
  const boundary = now - 9.5 * HOUR;
  const { result } = await load(
    [
      session('rest', boundary - 9 * HOUR, boundary),
      session('driving', boundary),
    ],
    boundary,
  );
  expect(result.current.dailyDrivingComplete).toBe(true);
  expect(result.current.dailyExtensionsKnown).toBe(false);
  expect(result.current.dailyDrivingLimit).toBeNull();
  expect(result.current.warnings.dailyDriving).toBeNull();
  expect(
    result.current.alerts.some((alert) => alert.id === 'dailyDriving'),
  ).toBe(false);
});

it('still reports the absolute ten-hour threshold when only extension history is unknown', async () => {
  const now = new Date(2026, 10, 4, 12).getTime();
  jest.setSystemTime(now);
  const boundary = now - 10 * HOUR;
  const { result } = await load(
    [
      session('rest', boundary - 9 * HOUR, boundary),
      session('driving', boundary),
    ],
    boundary,
  );
  expect(result.current.dailyDrivingComplete).toBe(true);
  expect(result.current.dailyExtensionsKnown).toBe(false);
  expect(
    result.current.alerts.find((alert) => alert.id === 'dailyDriving'),
  ).toEqual({
    id: 'dailyDriving',
    severity: 'danger',
    messageKey: 'workTimer.warnings.dailyDriving.maximumReachedUnknownHistory',
  });
});

it('does not claim complete daily data across a gap after a known rest', async () => {
  const boundary = NOW - 12 * HOUR;
  const { result } = await load(
    [
      session('driving', boundary, boundary + 5 * HOUR),
      session('driving', NOW - 5 * HOUR),
    ],
    boundary,
  );
  expect(result.current.counters.dailyDriving).toBe(10 * HOUR);
  expect(result.current.dailyDrivingComplete).toBe(false);
  expect(result.current.warnings.dailyDriving).toBeNull();
});

it('loads a daily period older than the two-week calendar window', async () => {
  const boundary = NOW - 20 * 24 * HOUR;
  const { result } = await load(
    [
      session('driving', boundary, boundary + HOUR),
      session('other_work', boundary + HOUR),
    ],
    boundary,
  );
  expect(getWorkSessionsInRange).toHaveBeenCalledWith(boundary, NOW);
  expect(result.current.counters.dailyDriving).toBe(HOUR);
  expect(result.current.dailyDrivingComplete).toBe(true);
});

it('uses the displayed ten-hour limit for a complete daily alert percentage', async () => {
  const boundary = NOW - 10.5 * HOUR;
  const { result } = await load(
    [session('rest', NOW - 48 * HOUR, boundary), session('driving', boundary)],
    boundary,
  );
  expect(result.current.dailyDrivingComplete).toBe(true);
  expect(result.current.dailyExtensionsKnown).toBe(true);
  expect(result.current.dailyDrivingLimit).toBe(10 * HOUR);
  expect(
    result.current.alerts.find((alert) => alert.id === 'dailyDriving')?.percent,
  ).toBe(105);
});

it('reports the actual remaining pre-break time and removes the pre-alert at the threshold', async () => {
  const { result } = await load([session('driving', NOW - 260 * 60_000)]);
  expect(
    result.current.alerts.find((alert) => alert.id === 'breakDueSoon')
      ?.remainingMs,
  ).toBe(10 * 60_000);
  await act(() => jest.advanceTimersByTime(10 * 60_000));
  expect(result.current.isBreakDueSoon).toBe(false);
  expect(
    result.current.alerts.some((alert) => alert.id === 'breakDueSoon'),
  ).toBe(false);
});

it('rejects conflicting loaded activities instead of double-counting them', async () => {
  const { result } = await load([
    session('driving', NOW - HOUR),
    session('other_work', NOW - 30 * 60_000),
  ]);
  expect(result.current.loadError).toBe(true);
});

it('does not truncate a recorded drive at a contradictory rest setting', async () => {
  const { result } = await load(
    [session('driving', NOW - 2 * HOUR)],
    NOW - HOUR,
  );
  expect(result.current.counters.dailyDriving).toBe(2 * HOUR);
  expect(result.current.dailyDrivingComplete).toBe(false);
  expect(result.current.dailyDrivingLimit).toBeNull();
});

it('hides clock-dependent counters when the running clock goes behind a saved record', async () => {
  const { result } = await load([session('driving', NOW - HOUR)]);
  jest.setSystemTime(NOW - 2 * HOUR);
  await act(() => jest.advanceTimersByTime(1_000));
  expect(result.current.loadError).toBe(true);
  expect(result.current.alerts).toEqual([]);
});
