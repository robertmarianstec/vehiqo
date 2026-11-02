import type { WorkMode, WorkSession } from '@/db/types';
import {
  hasContinuousCoverage,
  hasKnownExtensionHistory,
} from '@/utils/workTimerCoverage';

const HOUR = 3_600_000;
const WEEK = 100 * HOUR;

function session(
  mode: WorkMode,
  start: number,
  end: number | null,
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

describe('hasContinuousCoverage', () => {
  it('accepts an empty interval without inventing recorded activity', () => {
    expect(hasContinuousCoverage([], 10, 10)).toBe(true);
    expect(hasContinuousCoverage([], 10, 11)).toBe(false);
  });

  it('joins touching records across all five modes', () => {
    const modes: WorkMode[] = [
      'driving',
      'other_work',
      'standby',
      'break',
      'rest',
    ];
    const sessions = modes.map((mode, index) =>
      session(mode, index, index + 1),
    );
    expect(hasContinuousCoverage(sessions, 0, 5)).toBe(true);
  });

  it('sorts a copy and unions overlapping intervals', () => {
    const sessions = [session('rest', 5, 10), session('driving', 0, 7)];
    const original = [...sessions];
    expect(hasContinuousCoverage(sessions, 1, 9)).toBe(true);
    expect(sessions).toEqual(original);
  });

  it('does not use a zero-length record to bridge missing time', () => {
    expect(
      hasContinuousCoverage(
        [
          session('driving', 0, 4),
          session('other_work', 4, 4),
          session('rest', 5, 10),
        ],
        0,
        10,
      ),
    ).toBe(false);
  });

  it('ignores zero-length mode changes between touching positive records', () => {
    expect(
      hasContinuousCoverage(
        [
          session('rest', 0, 4),
          session('other_work', 4, 4),
          session('rest', 4, 10),
        ],
        0,
        10,
      ),
    ).toBe(true);
  });

  it('clips completed records and extends an ongoing record only to the requested end', () => {
    expect(
      hasContinuousCoverage(
        [
          session('driving', 0, 5),
          session('other_work', 5, null),
          session('rest', 20, null),
        ],
        2,
        10,
      ),
    ).toBe(true);
  });

  it.each([
    [NaN, 1],
    [0, Infinity],
    [2, 1],
  ])('rejects an invalid requested interval [%s, %s)', (from, to) => {
    expect(hasContinuousCoverage([session('driving', 0, null)], from, to)).toBe(
      false,
    );
  });

  it.each([
    session('driving', NaN, 10),
    session('driving', 0, Infinity),
    session('driving', 10, 5),
  ])('rejects invalid recorded intervals', (invalid) => {
    expect(hasContinuousCoverage([invalid], 0, 10)).toBe(false);
  });
});

describe('hasKnownExtensionHistory', () => {
  const complete = [
    session('rest', WEEK - 9 * HOUR, WEEK),
    session('driving', WEEK, WEEK + 10 * HOUR),
    session('rest', WEEK + 10 * HOUR, WEEK + 19 * HOUR),
    session('driving', WEEK + 19 * HOUR, null),
  ];

  it('does not infer the initial daily boundary from recording start', () => {
    expect(
      hasKnownExtensionHistory(
        [session('driving', WEEK, null)],
        WEEK,
        null,
        WEEK + HOUR,
      ),
    ).toBe(false);
  });

  it('does not treat a later first rest as proof of earlier weekly history', () => {
    expect(
      hasKnownExtensionHistory(
        [
          session('rest', WEEK + 5 * HOUR, WEEK + 14 * HOUR),
          session('driving', WEEK + 14 * HOUR, null),
        ],
        WEEK,
        WEEK + 14 * HOUR,
        WEEK + 15 * HOUR,
      ),
    ).toBe(false);
  });

  it('accepts complete history anchored by a qualifying rest ending at the week start', () => {
    expect(
      hasKnownExtensionHistory(
        complete,
        WEEK,
        WEEK + 19 * HOUR,
        WEEK + 20 * HOUR,
      ),
    ).toBe(true);
  });

  it('rejects a gap even when both daily boundaries are known', () => {
    const incomplete = complete.map((record) =>
      record.mode === 'driving' && record.ended_at !== null
        ? { ...record, started_at: WEEK + HOUR }
        : record,
    );
    expect(
      hasKnownExtensionHistory(
        incomplete,
        WEEK,
        WEEK + 19 * HOUR,
        WEEK + 20 * HOUR,
      ),
    ).toBe(false);
  });

  it('uses a qualifying rest spanning the week start as the first anchor', () => {
    const start = WEEK + 4 * HOUR;
    expect(
      hasKnownExtensionHistory(
        [
          session('rest', WEEK - 5 * HOUR, start),
          session('driving', start, null),
        ],
        WEEK,
        start,
        start + HOUR,
      ),
    ).toBe(true);
  });

  it('recognizes a fragmented cross-week rest despite zero-length mode records', () => {
    const start = WEEK + 4 * HOUR;
    expect(
      hasKnownExtensionHistory(
        [
          session('rest', WEEK - 5 * HOUR, WEEK),
          session('other_work', WEEK, WEEK),
          session('rest', WEEK, start),
          session('driving', start, null),
        ],
        WEEK,
        start,
        start + HOUR,
      ),
    ).toBe(true);
  });

  it('does not merge a cross-week rest through a positive other-work interval', () => {
    const start = WEEK + 9 * HOUR + 1;
    expect(
      hasKnownExtensionHistory(
        [
          session('rest', WEEK - 5 * HOUR, WEEK),
          session('other_work', WEEK, WEEK + 1),
          session('rest', WEEK + 1, start),
          session('driving', start, null),
        ],
        WEEK,
        start,
        start + HOUR,
      ),
    ).toBe(false);
  });

  it('knows that no earlier period began this week when the current period predates it', () => {
    const start = WEEK - HOUR;
    expect(
      hasKnownExtensionHistory(
        [
          session('rest', start - 9 * HOUR, start),
          session('driving', start, null),
        ],
        WEEK,
        start,
        WEEK + HOUR,
      ),
    ).toBe(true);
  });

  it('accepts the empty earlier-history interval at the week-start boundary', () => {
    expect(hasKnownExtensionHistory(complete, WEEK, WEEK, WEEK)).toBe(true);
  });

  it('does not establish a boundary from a rest ending in the future', () => {
    const now = WEEK + HOUR;
    expect(
      hasKnownExtensionHistory(
        [session('rest', WEEK - 9 * HOUR, now + HOUR)],
        WEEK,
        now + HOUR,
        now,
      ),
    ).toBe(false);
  });
});
