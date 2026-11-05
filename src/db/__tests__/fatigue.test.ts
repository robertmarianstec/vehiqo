import { getDatabase } from '@/db';
import {
  getFatigueSnapshot,
  saveFatigueAction as saveAction,
} from '@/db/fatigue';
import { clearAllLocalData } from '@/db/queries';
import { SCHEMA_SQL } from '@/db/schema';
import type { FatigueAction } from '@/db/types';
import { createTestDatabase } from '@/test/sqlite';

jest.mock('@/db', () => ({
  getDatabase: jest.fn(),
  WebDatabaseUnavailableError: class extends Error {},
}));
jest.mock('@/utils/id', () => {
  let id = 0;
  return { generateId: () => `sleep-${++id}` };
});
const NOW = new Date(2026, 10, 4, 14, 35).getTime();
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime();
let database: ReturnType<typeof createTestDatabase>;
async function saveFatigueAction(action: FatigueAction, revision: number) {
  return saveAction(action, revision, (await getFatigueSnapshot()).generation);
}
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

it('restores wake and open/completed sleep, while preserving work modes and old fatigue data', async () => {
  database.sqlite.exec(
    "INSERT INTO work_sessions VALUES ('w','other_work',1,NULL,1,1,NULL); INSERT INTO fatigue_sessions VALUES ('old',1,2,1,1,2,NULL);",
  );
  expect(await getFatigueSnapshot()).toMatchObject({
    wokeAt: null,
    entries: [],
    revision: 0,
  });
  await saveFatigueAction({ type: 'wake', at: at(3, 6) }, 0);
  await saveFatigueAction({ type: 'sleep', at: at(3, 22) }, 1);
  expect((await getFatigueSnapshot()).entries[0].woke_at).toBeNull();
  await saveFatigueAction({ type: 'wake', at: at(4, 6) }, 2);
  const restored = await getFatigueSnapshot();
  expect(restored).toMatchObject({
    wokeAt: at(4, 6),
    revision: 3,
    entries: [{ slept_at: at(3, 22), woke_at: at(4, 6) }],
  });
  expect(
    database.sqlite.prepare('SELECT mode FROM work_sessions').get(),
  ).toEqual({ mode: 'other_work' });
  expect(
    database.sqlite.prepare('SELECT id FROM fatigue_sessions').get(),
  ).toEqual({ id: 'old' });
});

it('adds a past night on first use, sums naps and corrects the corresponding wake atomically', async () => {
  await saveFatigueAction(
    { type: 'addSleep', from: at(3, 22), to: at(4, 6) },
    0,
  );
  const corrected = await saveFatigueAction(
    { type: 'correctWake', at: at(4, 5, 30) },
    1,
  );
  expect(corrected.entries[0].woke_at).toBe(at(4, 5, 30));
  await saveFatigueAction({ type: 'sleep', at: at(4, 12) }, 2);
  const result = await saveFatigueAction({ type: 'wake', at: at(4, 13) }, 3);
  expect(result.entries).toHaveLength(2);
  expect(result.wokeAt).toBe(at(4, 13));
});

it('rejects future, overlapping, reversed and post-wake intervals without changing storage', async () => {
  await saveFatigueAction(
    { type: 'addSleep', from: at(3, 22), to: at(4, 6) },
    0,
  );
  for (const action of [
    { type: 'sleep' as const, at: NOW + 1 },
    { type: 'sleep' as const, at: at(4, 5) },
    { type: 'addSleep' as const, from: at(4, 5), to: at(4, 7) },
    { type: 'addSleep' as const, from: at(4, 10), to: at(4, 11) },
    { type: 'addSleep' as const, from: at(4, 6), to: at(4, 5) },
    { type: 'correctWake' as const, at: at(3, 21) },
  ])
    await expect(saveFatigueAction(action, 1)).rejects.toThrow();
  expect((await getFatigueSnapshot()).revision).toBe(1);
  expect((await getFatigueSnapshot()).entries).toHaveLength(1);
});

it('serializes duplicate transitions and rejects an outdated form after a reset', async () => {
  const actions = await Promise.allSettled([
    saveFatigueAction({ type: 'wake', at: at(4, 6) }, 0),
    saveFatigueAction({ type: 'wake', at: at(4, 7) }, 0),
  ]);
  expect(actions.map((action) => action.status)).toEqual([
    'fulfilled',
    'rejected',
  ]);
  await saveFatigueAction({ type: 'sleep', at: at(4, 12) }, 1);
  await clearAllLocalData();
  await expect(
    saveFatigueAction({ type: 'wake', at: at(4, 13) }, 2),
  ).rejects.toThrow('stale');
  expect(await getFatigueSnapshot()).toMatchObject({
    entries: [],
    wokeAt: null,
    revision: 0,
  });
});

it('rolls back a completed sleep if writing the new wake state fails, then allows retry', async () => {
  await saveFatigueAction({ type: 'wake', at: at(3, 6) }, 0);
  await saveFatigueAction({ type: 'sleep', at: at(3, 22) }, 1);
  database.sqlite.exec(
    "CREATE TRIGGER fail_state BEFORE INSERT ON fatigue_state BEGIN SELECT RAISE(ABORT, 'disk full'); END;",
  );
  await expect(
    saveFatigueAction({ type: 'wake', at: at(4, 6) }, 2),
  ).rejects.toThrow('disk full');
  expect((await getFatigueSnapshot()).entries[0].woke_at).toBeNull();
  database.sqlite.exec('DROP TRIGGER fail_state;');
  expect(
    (await saveFatigueAction({ type: 'wake', at: at(4, 6) }, 2)).wokeAt,
  ).toBe(at(4, 6));
});

it('rejects a pre-reset form even when the new state has the same revision and timestamps', async () => {
  const before = await saveFatigueAction({ type: 'wake', at: at(4, 6) }, 0);
  await clearAllLocalData();
  const after = await saveFatigueAction({ type: 'wake', at: at(4, 6) }, 0);
  expect(after.revision).toBe(before.revision);
  await expect(
    saveAction(
      { type: 'sleep', at: at(4, 12) },
      before.revision,
      before.generation,
    ),
  ).rejects.toThrow('stale');
});

it('repairs the exact missing-generation error on read through an already cached v4 handle without a restart', async () => {
  database.sqlite.exec(`ALTER TABLE fatigue_state RENAME TO complete_state;
    CREATE TABLE fatigue_state (id INTEGER PRIMARY KEY, woke_at INTEGER, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    INSERT INTO fatigue_state VALUES (1, ${at(4, 6)}, 1, ${NOW});
    INSERT INTO sleep_entries VALUES ('existing-sleep', ${at(3, 22)}, ${at(4, 6)}, ${NOW}, ${NOW});
    PRAGMA user_version = 4;`);
  expect(() =>
    database.sqlite.prepare('SELECT generation FROM fatigue_state').get(),
  ).toThrow('no such column');
  const restored = await getFatigueSnapshot();
  expect(restored).toMatchObject({
    wokeAt: at(4, 6),
    generation: expect.stringMatching(/^[a-f0-9]{32}$/),
    entries: [{ id: 'existing-sleep', slept_at: at(3, 22), woke_at: at(4, 6) }],
  });
  expect((await getFatigueSnapshot()).generation).toBe(restored.generation);
});

it('does not show a duration after the clock moves behind persisted edits or with corrupt history', async () => {
  await saveFatigueAction({ type: 'wake', at: at(4, 6) }, 0);
  jest.setSystemTime(NOW - 1000);
  await expect(getFatigueSnapshot()).rejects.toThrow();
  jest.setSystemTime(NOW);
  database.sqlite.exec(
    "INSERT INTO sleep_entries VALUES ('broken',1,2,1,1); UPDATE fatigue_state SET woke_at = 1;",
  );
  await expect(getFatigueSnapshot()).rejects.toThrow('invalidState');
});
