import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { getDatabase } from '@/db';
import { getFatigueSnapshot } from '@/db/fatigue';
import { SCHEMA_SQL } from '@/db/schema';
import { useFatigue } from '@/hooks/useFatigue';
import { createTestDatabase } from '@/test/sqlite';

jest.mock('@/db', () => ({
  getDatabase: jest.fn(),
  WebDatabaseUnavailableError: class extends Error {},
}));
jest.mock('@/utils/id', () => {
  let id = 0;
  return { generateId: () => `hook-sleep-${++id}` };
});
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
const NOW = new Date(2026, 10, 4, 14, 35).getTime();
let database: ReturnType<typeof createTestDatabase>;
beforeEach(() => {
  database = createTestDatabase(SCHEMA_SQL);
  jest.mocked(getDatabase).mockResolvedValue(database.adapter);
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => {
  jest.restoreAllMocks();
  database.sqlite.close();
});

it('restores an open sleep and subsequent wake across hook remounts', async () => {
  const first = await renderHook(useFatigue);
  await waitFor(() => expect(first.result.current.isLoading).toBe(false));
  await act(() =>
    first.result.current.save(
      { type: 'wake', at: NOW - 10 * 3600000 },
      0,
      null,
    ),
  );
  const base = first.result.current.snapshot!;
  await act(() =>
    first.result.current.save(
      { type: 'sleep', at: NOW - 2 * 3600000 },
      base.revision,
      base.generation,
    ),
  );
  await first.unmount();
  const second = await renderHook(useFatigue);
  await waitFor(() => expect(second.result.current.isLoading).toBe(false));
  expect(second.result.current.snapshot!.entries[0].woke_at).toBeNull();
  const opened = second.result.current.snapshot!;
  await act(() =>
    second.result.current.save(
      { type: 'wake', at: NOW - 3600000 },
      opened.revision,
      opened.generation,
    ),
  );
  expect((await getFatigueSnapshot()).wokeAt).toBe(NOW - 3600000);
  await second.unmount();
});

it('blocks simultaneous taps, retains persisted state on write failure and allows retry', async () => {
  const hook = await renderHook(useFatigue);
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  const original = database.adapter.runAsync;
  database.adapter.runAsync = jest
    .fn()
    .mockRejectedValue(new Error('disk full'));
  let outcomes: boolean[] = [];
  await act(async () => {
    outcomes = await Promise.all([
      hook.result.current.save({ type: 'wake', at: NOW }, 0, null),
      hook.result.current.save({ type: 'wake', at: NOW }, 0, null),
    ]);
  });
  expect(outcomes).toEqual([false, false]);
  expect(hook.result.current.saveError).toBe('saveFailed');
  expect(hook.result.current.snapshot!.wokeAt).toBeNull();
  database.adapter.runAsync = original;
  await act(() => hook.result.current.save({ type: 'wake', at: NOW }, 0, null));
  expect(hook.result.current.saveError).toBeNull();
  expect(hook.result.current.snapshot!.wokeAt).toBe(NOW);
  await hook.unmount();
});

it('refreshes on returning to the app and exposes failed reads instead of a stale counter', async () => {
  let onState: ((state: AppStateStatus) => void) | undefined;
  const removed = jest.fn();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, callback) => {
      onState = callback;
      return { remove: removed };
    });
  const hook = await renderHook(useFatigue);
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  jest.mocked(getDatabase).mockRejectedValueOnce(new Error('read failed'));
  await act(async () => {
    onState?.('active');
  });
  await waitFor(() => expect(hook.result.current.loadError).toBe(true));
  await act(() => hook.result.current.refresh());
  expect(hook.result.current.loadError).toBe(false);
  await hook.unmount();
  expect(removed).toHaveBeenCalledTimes(1);
});

it('updates time without rewriting storage and hides the counter after a clock rollback', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  const hook = await renderHook(useFatigue);
  try {
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await act(() =>
      hook.result.current.save({ type: 'wake', at: NOW - 3600000 }, 0, null),
    );
    const writes = jest.spyOn(database.adapter, 'runAsync');
    await act(async () => {
      jest.advanceTimersByTime(65000);
    });
    expect(hook.result.current.now).toBe(NOW + 65000);
    expect(writes).not.toHaveBeenCalled();
    jest.setSystemTime(NOW - 60000);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(hook.result.current.clockError).toBe(true);
  } finally {
    await hook.unmount();
    jest.useRealTimers();
  }
});
