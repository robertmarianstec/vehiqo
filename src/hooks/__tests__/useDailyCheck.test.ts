import { act, renderHook, waitFor } from '@testing-library/react-native';

import { getDatabase } from '@/db';
import { getOrCreateDailyCheck } from '@/db/dailyChecks';
import { SCHEMA_SQL } from '@/db/schema';
import { useDailyCheck } from '@/hooks/useDailyCheck';
import {
  discardDailyCheckPhoto,
  pickDailyCheckPhoto,
} from '@/services/dailyCheckPhotos';
import { createTestDatabase } from '@/test/sqlite';

jest.mock('@/db', () => ({
  getDatabase: jest.fn(),
  WebDatabaseUnavailableError: class extends Error {},
}));
jest.mock('@/utils/id', () => {
  let id = 0;
  return { generateId: () => `hook-check-${++id}` };
});
jest.mock('@/services/dailyCheckPhotos', () => ({
  discardDailyCheckPhoto: jest.fn(),
  pickDailyCheckPhoto: jest.fn(),
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
let database: ReturnType<typeof createTestDatabase>;
beforeEach(() => {
  jest.clearAllMocks();
  database = createTestDatabase(SCHEMA_SQL);
  jest.mocked(getDatabase).mockResolvedValue(database.adapter);
  jest.mocked(pickDailyCheckPhoto).mockResolvedValue(null);
});
afterEach(() => {
  database.sqlite.close();
});

it('restores saved notes and checks after remount and keeps vehicle drafts independent', async () => {
  const first = await renderHook(useDailyCheck);
  await waitFor(() => expect(first.result.current.isLoading).toBe(false));
  const item = first.result.current.record!.items[0];
  await act(async () => {
    first.result.current.editItem(item.id, { checked: 1, note: 'Opona' });
    await first.result.current.flush();
  });
  await first.unmount();
  const second = await renderHook(useDailyCheck);
  await waitFor(() => expect(second.result.current.isLoading).toBe(false));
  expect(second.result.current.record!.items[0]).toMatchObject({
    checked: 1,
    note: 'Opona',
  });
  await act(() => second.result.current.selectVehicle('trailer'));
  expect(
    second.result.current.record!.items.every((item) => item.checked === 0),
  ).toBe(true);
  await act(() => second.result.current.selectVehicle('tractor'));
  expect(second.result.current.record!.items[0].note).toBe('Opona');
  await second.unmount();
});

it('retains newer typing after a failed write, blocks navigation, and retries the latest fields', async () => {
  const hook = await renderHook(useDailyCheck);
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  const item = hook.result.current.record!.items[0];
  const original = database.adapter.runAsync;
  database.adapter.runAsync = jest
    .fn()
    .mockRejectedValue(new Error('disk full'));
  await act(async () => {
    hook.result.current.editItem(item.id, { note: 'O' });
    hook.result.current.editItem(item.id, { note: 'Opona' });
    hook.result.current.editItem(item.id, { checked: 1 });
    await hook.result.current.flush();
  });
  expect(hook.result.current.saveError).toBe(true);
  expect(hook.result.current.record!.items[0]).toMatchObject({
    note: 'Opona',
    checked: 1,
  });
  await act(() => hook.result.current.selectVehicle('trailer'));
  expect(hook.result.current.vehicle).toBe('tractor');
  expect((await getOrCreateDailyCheck('tractor')).items[0].note).toBeNull();
  database.adapter.runAsync = original;
  await act(() => hook.result.current.retrySave());
  expect(hook.result.current.saveError).toBe(false);
  expect((await getOrCreateDailyCheck('tractor')).items[0]).toMatchObject({
    note: 'Opona',
    checked: 1,
  });
  await hook.unmount();
});

it('finishes only after pending changes are saved and restores the completed record and name', async () => {
  const first = await renderHook(useDailyCheck);
  await waitFor(() => expect(first.result.current.isLoading).toBe(false));
  await act(async () => {
    for (const item of first.result.current.record!.items)
      first.result.current.editItem(item.id, { checked: 1 });
    expect(await first.result.current.finish('Jan', true)).toBe(true);
  });
  expect(first.result.current.record!.check.driver_name).toBe('Jan');
  expect(first.result.current.record!.check.completed_at).not.toBeNull();
  await first.unmount();
  const second = await renderHook(useDailyCheck);
  await waitFor(() => expect(second.result.current.isLoading).toBe(false));
  expect(second.result.current.record!.check.driver_name).toBe('Jan');
  expect(second.result.current.record!.check.completed_at).not.toBeNull();
  await second.unmount();
});

it('keeps photos optional, persists an attachment, and preserves it if removal fails', async () => {
  const hook = await renderHook(useDailyCheck);
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  const id = hook.result.current.record!.items[0].id;
  await act(() => hook.result.current.changePhoto(id));
  expect(hook.result.current.photoError).toBe(false);
  expect(hook.result.current.record!.items[0].photo_uri).toBeNull();
  jest
    .mocked(pickDailyCheckPhoto)
    .mockResolvedValue('file:///document/daily-check-photos/photo.jpg');
  await act(() => hook.result.current.changePhoto(id));
  expect((await getOrCreateDailyCheck('tractor')).items[0].photo_uri).toContain(
    'photo.jpg',
  );
  const original = database.adapter.runAsync;
  database.adapter.runAsync = jest
    .fn()
    .mockRejectedValue(new Error('disk full'));
  await act(() => hook.result.current.changePhoto(id, true));
  expect(hook.result.current.photoError).toBe(true);
  expect(hook.result.current.record!.items[0].photo_uri).toContain('photo.jpg');
  expect(discardDailyCheckPhoto).not.toHaveBeenCalledWith(
    'file:///document/daily-check-photos/photo.jpg',
  );
  database.adapter.runAsync = original;
  await act(() => hook.result.current.changePhoto(id, true));
  expect(hook.result.current.record!.items[0].photo_uri).toBeNull();
  expect(discardDailyCheckPhoto).toHaveBeenCalledWith(
    'file:///document/daily-check-photos/photo.jpg',
  );
  await hook.unmount();
});

it('reports failed completion and trailer changes without showing a false success', async () => {
  const hook = await renderHook(useDailyCheck);
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  await act(() => hook.result.current.finish('Jan', true));
  expect(hook.result.current.actionError).toBe(true);
  expect(hook.result.current.record!.check.completed_at).toBeNull();
  await act(() => hook.result.current.selectVehicle('trailer'));
  expect(hook.result.current.actionError).toBe(false);
  database.adapter.runAsync = jest
    .fn()
    .mockRejectedValue(new Error('disk full'));
  await act(() => hook.result.current.setTrailerType('fridge'));
  expect(hook.result.current.actionError).toBe(true);
  expect(hook.result.current.record!.check.trailer_type).toBe('curtain');
  await hook.unmount();
});
