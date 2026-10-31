import type { WorkMode, WorkSession } from '@/db/types';
import {
  getDayBounds,
  getDaySegments,
  getWeekStart,
} from '@/utils/dayTimeline';

function session(
  mode: WorkMode,
  started_at: number,
  ended_at: number | null,
): WorkSession {
  return {
    id: 'test',
    mode,
    started_at,
    ended_at,
    created_at: started_at,
    updated_at: started_at,
    synced_at: null,
  };
}

const DAY_START = 1000;
const DAY_END = 2000;
const NOW = 3000;

const CLOCK_CHANGE_DAYS = [
  { name: 'spring forward', month: 2, day: 29, hours: 23 },
  { name: 'autumn back', month: 9, day: 25, hours: 25 },
];

describe('getDaySegments', () => {
  it.each(CLOCK_CHANGE_DAYS)(
    'keeps late-evening driving on the $name day',
    ({ month, day }) => {
      const now = new Date(2026, month, day, 23, 45).getTime();
      const start = new Date(2026, month, day, 23, 30).getTime();
      const { dayStart, dayEnd } = getDayBounds(now);

      expect(
        getDaySegments(
          [session('driving', start, null)],
          dayStart,
          dayEnd,
          now,
        ),
      ).toEqual([{ mode: 'driving', start, end: now }]);
    },
  );

  it.each(CLOCK_CHANGE_DAYS)(
    'clips driving at the next midnight on the $name day',
    ({ month, day }) => {
      const now = new Date(2026, month, day + 1, 1).getTime();
      const start = new Date(2026, month, day, 23, 30).getTime();
      const end = new Date(2026, month, day + 1, 0, 30).getTime();
      const midnight = new Date(2026, month, day + 1).getTime();
      const { dayStart, dayEnd } = getDayBounds(start);

      expect(
        getDaySegments([session('driving', start, end)], dayStart, dayEnd, now),
      ).toEqual([{ mode: 'driving', start, end: midnight }]);
    },
  );

  it('returns an empty array for no sessions', () => {
    expect(getDaySegments([], DAY_START, DAY_END, NOW)).toEqual([]);
  });

  it('keeps a session fully inside the day unchanged', () => {
    expect(
      getDaySegments([session('driving', 1200, 1500)], DAY_START, DAY_END, NOW),
    ).toEqual([{ mode: 'driving', start: 1200, end: 1500 }]);
  });

  it('clips a session that starts before the day', () => {
    expect(
      getDaySegments([session('break', 500, 1300)], DAY_START, DAY_END, NOW),
    ).toEqual([{ mode: 'break', start: DAY_START, end: 1300 }]);
  });

  it('clips a session that ends after the day', () => {
    expect(
      getDaySegments([session('rest', 1700, 2500)], DAY_START, DAY_END, NOW),
    ).toEqual([{ mode: 'rest', start: 1700, end: DAY_END }]);
  });

  it('clips a session spanning the whole day to the window', () => {
    expect(
      getDaySegments([session('driving', 500, 2500)], DAY_START, DAY_END, NOW),
    ).toEqual([{ mode: 'driving', start: DAY_START, end: DAY_END }]);
  });

  it('drops a session entirely before the day', () => {
    expect(
      getDaySegments([session('driving', 100, 900)], DAY_START, DAY_END, NOW),
    ).toEqual([]);
  });

  it('drops a session entirely after the day', () => {
    expect(
      getDaySegments([session('driving', 2100, 2500)], DAY_START, DAY_END, NOW),
    ).toEqual([]);
  });

  it('ends an ongoing session at now when now is inside the day', () => {
    const nowInside = 1600;
    expect(
      getDaySegments(
        [session('driving', 1200, null)],
        DAY_START,
        DAY_END,
        nowInside,
      ),
    ).toEqual([{ mode: 'driving', start: 1200, end: nowInside }]);
  });

  it('clamps an ongoing session to the day end when now is past it', () => {
    expect(
      getDaySegments([session('driving', 1200, null)], DAY_START, DAY_END, NOW),
    ).toEqual([{ mode: 'driving', start: 1200, end: DAY_END }]);
  });

  it('sorts segments by start time', () => {
    const segments = getDaySegments(
      [
        session('rest', 1600, 1800),
        session('driving', 1100, 1300),
        session('break', 1300, 1600),
      ],
      DAY_START,
      DAY_END,
      NOW,
    );
    expect(segments.map((s) => s.mode)).toEqual(['driving', 'break', 'rest']);
  });
});

describe('getDayBounds', () => {
  it.each(CLOCK_CHANGE_DAYS)(
    'uses consecutive local midnights on the $name day ($hours hours)',
    ({ month, day, hours }) => {
      const noon = new Date(2026, month, day, 12).getTime();
      const bounds = getDayBounds(noon);

      expect(bounds).toEqual({
        dayStart: new Date(2026, month, day).getTime(),
        dayEnd: new Date(2026, month, day + 1).getTime(),
      });
      expect(bounds.dayEnd - bounds.dayStart).toBe(hours * 60 * 60 * 1000);
      expect(
        getDayBounds(new Date(2026, month, day, 23, 59).getTime()),
      ).toEqual(bounds);
    },
  );

  it('returns local midnight to midnight spanning 24 hours', () => {
    const now = new Date(2026, 5, 15, 14, 30, 0).getTime();
    const { dayStart, dayEnd } = getDayBounds(now);

    expect(new Date(dayStart)).toEqual(new Date(2026, 5, 15, 0, 0, 0, 0));
    expect(dayEnd - dayStart).toBe(24 * 60 * 60 * 1000);
  });

  it('gives the same bounds for any time within the same day', () => {
    const morning = new Date(2026, 5, 15, 0, 0, 1).getTime();
    const night = new Date(2026, 5, 15, 23, 59, 59).getTime();

    expect(getDayBounds(morning)).toEqual(getDayBounds(night));
  });
});

// 2026-06-15 is a Monday, so that calendar week runs 15 Jun – 21 Jun.
describe('getWeekStart', () => {
  const MONDAY_MIDNIGHT = new Date(2026, 5, 15, 0, 0, 0, 0);

  it('returns local Monday midnight for a midweek moment', () => {
    const wednesday = new Date(2026, 5, 17, 14, 30, 0).getTime();

    expect(new Date(getWeekStart(wednesday))).toEqual(MONDAY_MIDNIGHT);
  });

  it('returns the same day when already Monday', () => {
    const monday = new Date(2026, 5, 15, 9, 0, 0).getTime();

    expect(new Date(getWeekStart(monday))).toEqual(MONDAY_MIDNIGHT);
  });

  it('treats Sunday as the last day of the week, not the first', () => {
    const sunday = new Date(2026, 5, 21, 23, 59, 59).getTime();

    expect(new Date(getWeekStart(sunday))).toEqual(MONDAY_MIDNIGHT);
  });

  it('gives the same start for every day within one week', () => {
    const starts = [15, 16, 17, 18, 19, 20, 21].map((day) =>
      getWeekStart(new Date(2026, 5, day, 12, 0, 0).getTime()),
    );

    expect(new Set(starts).size).toBe(1);
  });
});
