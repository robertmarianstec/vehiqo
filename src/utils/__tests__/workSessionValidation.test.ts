import type { WorkMode, WorkSession } from '@/db/types';
import { assertValidWorkSessions } from '@/utils/workSessionValidation';

function session(
  mode: WorkMode,
  start: number,
  end: number | null,
): WorkSession {
  return {
    id: 'test',
    mode,
    started_at: start,
    ended_at: end,
    created_at: start,
    updated_at: end ?? start,
    synced_at: null,
  };
}

const INVALID_TIMES = [
  NaN,
  Infinity,
  -Infinity,
  1.5,
  Number.MAX_SAFE_INTEGER + 1,
  8_640_000_000_000_001,
];

describe('assertValidWorkSessions', () => {
  it('accepts an empty history', () => {
    expect(() => assertValidWorkSessions([])).not.toThrow();
  });

  it.each(INVALID_TIMES)('rejects invalid starts %s', (start) => {
    expect(() =>
      assertValidWorkSessions([session('driving', start, null)]),
    ).toThrow();
  });

  it.each(INVALID_TIMES)('rejects invalid ends %s', (end) => {
    expect(() =>
      assertValidWorkSessions([session('driving', 0, end)]),
    ).toThrow();
  });

  it('rejects a reversed interval', () => {
    expect(() =>
      assertValidWorkSessions([session('driving', 10, 9)]),
    ).toThrow();
  });

  it('accepts valid timestamps before the epoch and at the Date boundary', () => {
    expect(() =>
      assertValidWorkSessions([
        session('driving', -10, 0),
        session('rest', 0, 8_640_000_000_000_000),
      ]),
    ).not.toThrow();
  });

  it('accepts future records without truncating them to the current clock', () => {
    const future = Date.now() + 60_000;
    const records = [session('driving', future, future + 60_000)];
    expect(() => assertValidWorkSessions(records)).not.toThrow();
    expect(records[0].ended_at).toBe(future + 60_000);
  });

  it('accepts touching activities and a final open session with duplicated test IDs', () => {
    expect(() =>
      assertValidWorkSessions([
        session('driving', 0, 10),
        session('other_work', 10, 20),
        session('rest', 20, null),
      ]),
    ).not.toThrow();
  });

  it.each([
    [session('driving', 0, 10), session('rest', 9, 20)],
    [session('driving', 0, 20), session('rest', 5, 10)],
    [session('driving', 0, null), session('rest', 10, 20)],
    [session('driving', 0, 20), session('rest', 10, null)],
    [session('driving', 0, null), session('rest', 10, null)],
  ])('rejects overlapping positive or open intervals', (...records) => {
    expect(() => assertValidWorkSessions(records)).toThrow(
      'Overlapping work sessions',
    );
  });

  it('ignores zero-duration rows even inside an open interval', () => {
    expect(() =>
      assertValidWorkSessions([
        session('driving', 0, 10),
        session('other_work', 5, 5),
        session('rest', 10, null),
        session('break', 20, 20),
      ]),
    ).not.toThrow();
  });

  it('does not mutate or reorder input records', () => {
    const records = [session('rest', 20, null), session('driving', 0, 10)];
    const before = records.map((record) => ({ ...record }));
    expect(() => assertValidWorkSessions(records)).not.toThrow();
    expect(records).toEqual(before);
  });
});
