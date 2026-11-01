import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import {
  getCurrentWorkSession,
  getWorkSessionsInRange,
  getWorkTimerSettings,
  startWorkSession,
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
const NOW = new Date(2026, 5, 17, 12).getTime();

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
  jest.mocked(getWorkTimerSettings).mockReset();
  const current = session('driving', NOW - HOUR);
  jest.mocked(getCurrentWorkSession).mockResolvedValue(current);
  jest.mocked(getWorkSessionsInRange).mockResolvedValue([current]);
  jest
    .mocked(getWorkTimerSettings)
    .mockResolvedValue({ lastDailyRestEnd: null, lastWeeklyRestEnd: null });
  jest
    .mocked(startWorkSession)
    .mockImplementation(async (mode) => session(mode, Date.now()));
});

afterEach(() => jest.useRealTimers());

async function loadTimer() {
  const hook = await renderHook(useWorkTimer);
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

it('counts the active record even when the history range excludes its exact start', async () => {
  jest.mocked(getCurrentWorkSession).mockResolvedValue(session('driving', NOW));
  jest.mocked(getWorkSessionsInRange).mockResolvedValue([]);
  const { result } = await loadTimer();
  await act(() => jest.advanceTimersByTime(60_000));
  expect(result.current.counters.drivingSinceBreak).toBe(60_000);
  expect(result.current.counters.dailyDriving).toBe(60_000);
});

it.each([
  {
    change: 'spring',
    sunday: new Date(2026, 2, 29, 23, 30).getTime(),
    monday: new Date(2026, 2, 16).getTime(),
  },
  {
    change: 'autumn',
    sunday: new Date(2026, 9, 25, 23, 30).getTime(),
    monday: new Date(2026, 9, 12).getTime(),
  },
])(
  'loads both complete calendar weeks on the evening of the $change clock change',
  async ({ sunday, monday }) => {
    jest.setSystemTime(sunday);
    jest.mocked(getCurrentWorkSession).mockResolvedValue(null);
    jest
      .mocked(getWorkSessionsInRange)
      .mockImplementation(async (from) =>
        from <= monday
          ? [session('driving', monday, monday + 30 * 60_000)]
          : [],
      );
    const { result } = await loadTimer();
    expect(result.current.counters.biweeklyDriving).toBe(30 * 60_000);
  },
);

it('refreshes elapsed driving immediately after returning from the background', async () => {
  let onChange: ((state: AppStateStatus) => void) | undefined;
  const remove = jest.fn();
  const listener = jest.mocked(AppState.addEventListener);
  const original = listener.getMockImplementation();
  listener.mockImplementation((_event, callback) => {
    onChange = callback;
    return { remove };
  });
  try {
    const { result, unmount } = await loadTimer();
    jest.setSystemTime(NOW + HOUR);
    await act(() => onChange?.('active'));
    expect(result.current.counters.drivingSinceBreak).toBe(2 * HOUR);
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  } finally {
    if (original) listener.mockImplementation(original);
  }
});

it('does not duplicate a record returned for an already selected mode', async () => {
  const current = session('driving', NOW - HOUR);
  jest.mocked(startWorkSession).mockResolvedValue(current);
  const { result } = await loadTimer();
  await act(() => result.current.switchMode('driving'));
  expect(result.current.counters.drivingSinceBreak).toBe(HOUR);
  expect(result.current.counters.weeklyDriving).toBe(HOUR);
});

it('uses the committed history when leaving rest without a second settings read', async () => {
  const rest = session('rest', NOW - 9 * HOUR);
  jest.mocked(getCurrentWorkSession).mockResolvedValue(rest);
  jest.mocked(getWorkSessionsInRange).mockResolvedValue([rest]);
  jest
    .mocked(getWorkTimerSettings)
    .mockResolvedValueOnce({ lastDailyRestEnd: null, lastWeeklyRestEnd: null })
    .mockRejectedValue(new Error('settings read failed'));
  const { result } = await loadTimer();
  await act(() =>
    expect(result.current.switchMode('driving')).resolves.toBeUndefined(),
  );
  await act(() => jest.advanceTimersByTime(HOUR));
  expect(result.current.currentMode).toBe('driving');
  expect(result.current.counters.dailyDriving).toBe(HOUR);
});

it('keeps the previous mode and counters when saving fails', async () => {
  const { result } = await loadTimer();
  jest.mocked(startWorkSession).mockRejectedValue(new Error('disk full'));
  await act(() =>
    expect(result.current.switchMode('break')).rejects.toThrow('disk full'),
  );
  expect(result.current.currentMode).toBe('driving');
  expect(result.current.counters.drivingSinceBreak).toBe(HOUR);
});
