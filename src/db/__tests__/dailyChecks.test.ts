import { getDatabase } from '@/db';
import {
  changeDailyCheckTrailerType,
  completeDailyCheck,
  getDailyCheckDriverName,
  getOrCreateDailyCheck,
  updateDailyCheckItem,
} from '@/db/dailyChecks';
import { getThemePreference, setThemePreference } from '@/db/queries';
import { SCHEMA_SQL } from '@/db/schema';
import { createTestDatabase } from '@/test/sqlite';

jest.mock('@/db', () => ({
  getDatabase: jest.fn(),
  WebDatabaseUnavailableError: class extends Error {},
}));
jest.mock('@/utils/id', () => {
  let id = 0;
  return { generateId: () => `check-${++id}` };
});
const NOW = new Date(2026, 10, 3, 8).getTime();
let database: ReturnType<typeof createTestDatabase>;
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  database = createTestDatabase(SCHEMA_SQL);
  jest.mocked(getDatabase).mockResolvedValue(database.adapter);
});
afterEach(() => {
  database.sqlite.close();
  jest.useRealTimers();
});

async function checkedTractor() {
  let record = await getOrCreateDailyCheck('tractor');
  for (const item of record.items)
    record = await updateDailyCheckItem(record.check.id, item.id, {
      checked: 1,
    });
  return record;
}

it('creates independent empty checklists and restores the same drafts', async () => {
  const [tractor, trailer] = await Promise.all([
    getOrCreateDailyCheck('tractor'),
    getOrCreateDailyCheck('trailer'),
  ]);
  expect(tractor.items.map((item) => item.item_key)).toEqual([
    'tyres',
    'lights',
    'mirrors',
    'brakes',
    'fluids',
    'coupling',
    'documents',
  ]);
  expect(trailer.items.map((item) => item.item_key)).toEqual([
    'tyres',
    'lights',
    'brakes',
    'coupling',
    'load',
    'body',
  ]);
  expect(tractor.items.every((item) => item.checked === 0)).toBe(true);
  expect(trailer.check.trailer_type).toBe('curtain');
  const [first, second] = await Promise.all([
    getOrCreateDailyCheck('tractor'),
    getOrCreateDailyCheck('tractor'),
  ]);
  expect(first.check.id).toBe(tractor.check.id);
  expect(second.check.id).toBe(tractor.check.id);
  expect(
    database.sqlite.prepare('SELECT COUNT(*) AS count FROM daily_checks').get(),
  ).toEqual({ count: 2 });
});

it('preserves independent note/inspection changes and clears critical when an issue is removed', async () => {
  const record = await getOrCreateDailyCheck('tractor'),
    item = record.items[0];
  await updateDailyCheckItem(record.check.id, item.id, {
    checked: 1,
    note: 'Opona do kontroli',
    has_issue: 1,
    is_critical: 1,
  });
  let restored = await getOrCreateDailyCheck('tractor');
  expect(restored.items[0]).toMatchObject({
    checked: 1,
    note: 'Opona do kontroli',
    has_issue: 1,
    is_critical: 1,
  });
  restored = await updateDailyCheckItem(record.check.id, item.id, {
    has_issue: 0,
  });
  expect(restored.items[0]).toMatchObject({
    checked: 1,
    has_issue: 0,
    is_critical: 0,
  });
});

it('resets the body inspection when trailer type changes and preserves the other entries', async () => {
  const record = await getOrCreateDailyCheck('trailer');
  for (const item of record.items)
    await updateDailyCheckItem(record.check.id, item.id, { checked: 1 });
  const changed = await changeDailyCheckTrailerType(record.check.id, 'fridge');
  expect(changed.check.trailer_type).toBe('fridge');
  expect(changed.items.find((item) => item.item_key === 'body')?.checked).toBe(
    0,
  );
  expect(
    changed.items
      .filter((item) => item.item_key !== 'body')
      .every((item) => item.checked === 1),
  ).toBe(true);
});

it('rejects incomplete lists, missing confirmation, blank names, and oversized input', async () => {
  const record = await getOrCreateDailyCheck('tractor');
  await expect(
    completeDailyCheck(record.check.id, 'Jan', true),
  ).rejects.toThrow('Incomplete');
  await expect(
    completeDailyCheck(record.check.id, 'Jan', false),
  ).rejects.toThrow('confirmation');
  await expect(completeDailyCheck(record.check.id, '  ', true)).rejects.toThrow(
    'confirmation',
  );
  await expect(
    completeDailyCheck(record.check.id, 'x'.repeat(81), true),
  ).rejects.toThrow('confirmation');
  await expect(
    updateDailyCheckItem(record.check.id, record.items[0].id, {
      note: 'x'.repeat(2001),
    }),
  ).rejects.toThrow('note');
  await expect(
    updateDailyCheckItem(record.check.id, record.items[0].id, {
      is_critical: 1,
    }),
  ).rejects.toThrow('flags');
  await expect(
    updateDailyCheckItem(record.check.id, record.items[0].id, {
      photo_uri: 'https://example.com/photo.jpg',
    }),
  ).rejects.toThrow('photo');
  expect(await getDailyCheckDriverName()).toBe('');
});

it('atomically records confirmation and driver name, preserves issues, and makes completion idempotent', async () => {
  const record = await checkedTractor();
  await updateDailyCheckItem(record.check.id, record.items[0].id, {
    has_issue: 1,
    is_critical: 1,
  });
  const [first, second] = await Promise.all([
    completeDailyCheck(record.check.id, ' Jan ', true),
    completeDailyCheck(record.check.id, 'Inna osoba', true),
  ]);
  expect(first.check.completed_at).toBe(NOW);
  expect(second.check.driver_name).toBe('Jan');
  expect(await getDailyCheckDriverName()).toBe('Jan');
  expect(second.items[0].is_critical).toBe(1);
  await expect(
    updateDailyCheckItem(record.check.id, record.items[0].id, { checked: 0 }),
  ).rejects.toThrow('completed');
  expect((await getOrCreateDailyCheck('tractor')).check.id).toBe(
    record.check.id,
  );
  const next = await getOrCreateDailyCheck('tractor', true);
  expect(next.check.id).not.toBe(record.check.id);
  expect(next.items.every((item) => item.checked === 0)).toBe(true);
});

it('starts a new check on the next day without deleting a completed record', async () => {
  const record = await checkedTractor();
  await completeDailyCheck(record.check.id, 'Jan', true);
  jest.setSystemTime(NOW + 24 * 3_600_000);
  const next = await getOrCreateDailyCheck('tractor');
  expect(next.check.id).not.toBe(record.check.id);
  expect(
    database.sqlite.prepare('SELECT COUNT(*) AS count FROM daily_checks').get(),
  ).toEqual({ count: 2 });
});

it('rejects clock rollback and cross-check item IDs without changing stored data', async () => {
  const tractor = await getOrCreateDailyCheck('tractor'),
    trailer = await getOrCreateDailyCheck('trailer');
  await expect(
    updateDailyCheckItem(tractor.check.id, trailer.items[0].id, { checked: 1 }),
  ).rejects.toThrow('not found');
  jest.setSystemTime(NOW - 1);
  await expect(
    updateDailyCheckItem(tractor.check.id, tractor.items[0].id, { checked: 1 }),
  ).rejects.toThrow('precedes');
  expect(
    database.sqlite
      .prepare('SELECT checked FROM daily_check_items WHERE id = ?')
      .get(tractor.items[0].id),
  ).toEqual({ checked: 0 });
});

it('rolls back a failed item write and allows subsequent timer/settings operations', async () => {
  const record = await getOrCreateDailyCheck('tractor');
  database.sqlite.exec(
    "CREATE TRIGGER fail_check BEFORE UPDATE ON daily_checks BEGIN SELECT RAISE(ABORT, 'disk full'); END;",
  );
  await expect(
    updateDailyCheckItem(record.check.id, record.items[0].id, { checked: 1 }),
  ).rejects.toThrow('disk full');
  expect((await getOrCreateDailyCheck('tractor')).items[0].checked).toBe(0);
  await setThemePreference('dark');
  expect(await getThemePreference()).toBe('dark');
});

it('rolls back completion when saving the remembered name fails', async () => {
  const record = await checkedTractor();
  database.sqlite.exec(
    "CREATE TRIGGER fail_name BEFORE INSERT ON app_settings BEGIN SELECT RAISE(ABORT, 'disk full'); END;",
  );
  await expect(
    completeDailyCheck(record.check.id, 'Jan', true),
  ).rejects.toThrow('disk full');
  expect(
    (await getOrCreateDailyCheck('tractor')).check.completed_at,
  ).toBeNull();
});
