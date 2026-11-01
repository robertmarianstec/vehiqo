import type { WorkSession } from '@/db/types';
import { computeCounters } from '@/hooks/useWorkTimer';

jest.mock('@/db/queries', () => ({
  getCurrentWorkSession: jest.fn(),
  getWorkSessionsInRange: jest.fn(),
  getWorkTimerSettings: jest.fn(),
  startWorkSession: jest.fn(),
}));

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

function session(
  mode: WorkSession['mode'],
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

describe('computeCounters — drivingSinceBreak', () => {
  it('returns 0 with no sessions', () => {
    const { drivingSinceBreak } = computeCounters([], 10 * HOUR, null);
    expect(drivingSinceBreak).toBe(0);
  });

  it('counts ongoing driving session', () => {
    const sessions = [session('driving', 0, null)];
    const { drivingSinceBreak } = computeCounters(sessions, 2 * HOUR, null);
    expect(drivingSinceBreak).toBe(2 * HOUR);
  });

  it('resets after a 45-min break', () => {
    const sessions = [
      session('driving', 0, 4 * HOUR),
      session('break', 4 * HOUR, 4 * HOUR + 45 * MIN),
      session('driving', 4 * HOUR + 45 * MIN, null),
    ];
    const now = 4 * HOUR + 45 * MIN + HOUR;
    const { drivingSinceBreak } = computeCounters(sessions, now, null);
    expect(drivingSinceBreak).toBe(HOUR);
  });

  it('standby and other_work do not add to drivingSinceBreak', () => {
    const sessions = [
      session('driving', 0, HOUR),
      session('standby', HOUR, 2 * HOUR),
      session('other_work', 2 * HOUR, 3 * HOUR),
      session('driving', 3 * HOUR, null),
    ];
    const { drivingSinceBreak } = computeCounters(sessions, 4 * HOUR, null);
    expect(drivingSinceBreak).toBe(2 * HOUR);
  });
});

describe('computeCounters — dailyDriving', () => {
  // 2026-06-17 is a Wednesday, inside the Mon 15 – Sun 21 June calendar week.
  const WED_NOON = new Date(2026, 5, 17, 12, 0, 0).getTime();

  it('recovers the rest end from history instead of cutting off driving at midnight', () => {
    const restEnd = new Date(2026, 5, 16, 16).getTime();
    const sessions = [
      session('rest', restEnd - 9 * HOUR, restEnd),
      session(
        'driving',
        new Date(2026, 5, 16, 22).getTime(),
        new Date(2026, 5, 17, 3).getTime(),
      ),
    ];
    expect(computeCounters(sessions, WED_NOON, null).dailyDriving).toBe(
      5 * HOUR,
    );
  });

  it.each([
    { restDuration: 9 * HOUR - 1, expected: 4 * HOUR },
    { restDuration: 9 * HOUR, expected: 2 * HOUR },
    { restDuration: 11 * HOUR, expected: 2 * HOUR },
    { restDuration: 24 * HOUR, expected: 2 * HOUR },
  ])(
    'uses a newer completed rest only when it qualifies ($restDuration ms)',
    ({ restDuration, expected }) => {
      const restEnd = 11 * HOUR + restDuration;
      const sessions = [
        session('rest', 0, 9 * HOUR),
        session('driving', 9 * HOUR, 11 * HOUR),
        session('rest', 11 * HOUR, restEnd),
        session('driving', restEnd, null),
      ];
      expect(
        computeCounters(sessions, restEnd + 2 * HOUR, 9 * HOUR).dailyDriving,
      ).toBe(expected);
    },
  );

  it('does not invent a rest end while the next rest is still ongoing', () => {
    const sessions = [
      session('rest', 0, 9 * HOUR),
      session('driving', 9 * HOUR, 11 * HOUR),
      session('rest', 11 * HOUR, null),
    ];
    expect(computeCounters(sessions, 22 * HOUR, 9 * HOUR).dailyDriving).toBe(
      2 * HOUR,
    );
  });

  it('falls back to the start of the calendar day, not the epoch', () => {
    const sessions = [
      session(
        'driving',
        new Date(2026, 5, 16, 9, 0, 0).getTime(),
        new Date(2026, 5, 16, 14, 0, 0).getTime(),
      ),
      session(
        'driving',
        new Date(2026, 5, 17, 8, 0, 0).getTime(),
        new Date(2026, 5, 17, 10, 0, 0).getTime(),
      ),
    ];
    const { dailyDriving } = computeCounters(sessions, WED_NOON, null);
    expect(dailyDriving).toBe(2 * HOUR);
  });

  it('clips a session that started before midnight to the current day', () => {
    const sessions = [
      session(
        'driving',
        new Date(2026, 5, 16, 22, 0, 0).getTime(),
        new Date(2026, 5, 17, 3, 0, 0).getTime(),
      ),
    ];
    const { dailyDriving } = computeCounters(sessions, WED_NOON, null);
    expect(dailyDriving).toBe(3 * HOUR);
  });

  it('honours a recorded rest end that precedes midnight', () => {
    const restEnd = new Date(2026, 5, 16, 20, 0, 0).getTime();
    const sessions = [
      session('driving', restEnd, new Date(2026, 5, 17, 1, 0, 0).getTime()),
    ];
    const { dailyDriving } = computeCounters(sessions, WED_NOON, restEnd);
    expect(dailyDriving).toBe(5 * HOUR);
  });

  it('counts only driving after lastDailyRestEnd', () => {
    const sessions = [
      session('driving', 0, 3 * HOUR),
      session('rest', 3 * HOUR, 14 * HOUR),
      session('driving', 14 * HOUR, 16 * HOUR),
    ];
    const { dailyDriving } = computeCounters(sessions, 16 * HOUR, 14 * HOUR);
    expect(dailyDriving).toBe(2 * HOUR);
  });

  it('excludes driving before lastDailyRestEnd', () => {
    const sessions = [
      session('driving', 0, 3 * HOUR),
      session('driving', 20 * HOUR, 22 * HOUR),
    ];
    const { dailyDriving } = computeCounters(sessions, 22 * HOUR, 14 * HOUR);
    expect(dailyDriving).toBe(2 * HOUR);
  });

  it('counts an ongoing driving session up to now', () => {
    const sessions = [session('driving', 14 * HOUR, null)];
    const { dailyDriving } = computeCounters(sessions, 16 * HOUR, 14 * HOUR);
    expect(dailyDriving).toBe(2 * HOUR);
  });
});

describe('computeCounters — weeklyDriving', () => {
  it('falls back to the start of the calendar week, not the epoch', () => {
    // Mon 15 Jun 2026 starts the week; the Sunday before it must be excluded.
    const sessions = [
      session(
        'driving',
        new Date(2026, 5, 14, 9, 0, 0).getTime(),
        new Date(2026, 5, 14, 17, 0, 0).getTime(),
      ),
      session(
        'driving',
        new Date(2026, 5, 16, 9, 0, 0).getTime(),
        new Date(2026, 5, 16, 13, 0, 0).getTime(),
      ),
    ];
    const now = new Date(2026, 5, 17, 12, 0, 0).getTime();
    const { weeklyDriving } = computeCounters(sessions, now, null);
    expect(weeklyDriving).toBe(4 * HOUR);
  });

  it('counts driving on both sides of a weekly rest in the same calendar week', () => {
    const monday = new Date(2026, 5, 15, 8).getTime();
    const tuesday = new Date(2026, 5, 16, 8).getTime();
    const wednesday = new Date(2026, 5, 17, 8).getTime();
    const sessions = [
      session('driving', monday, monday + 8 * HOUR),
      session('rest', tuesday, wednesday),
      session('driving', wednesday, null),
    ];
    const { weeklyDriving } = computeCounters(
      sessions,
      wednesday + 4 * HOUR,
      wednesday,
    );
    expect(weeklyDriving).toBe(12 * HOUR);
  });

  it('starts a new weekly total at Monday midnight during ongoing driving', () => {
    const sunday = new Date(2026, 5, 14, 22).getTime();
    const monday = new Date(2026, 5, 15).getTime();
    const sessions = [session('driving', sunday, null)];
    expect(computeCounters(sessions, monday - 1, null).weeklyDriving).toBe(
      2 * HOUR - 1,
    );
    expect(computeCounters(sessions, monday, null).weeklyDriving).toBe(0);
    expect(
      computeCounters(sessions, monday + 2 * HOUR, null).weeklyDriving,
    ).toBe(2 * HOUR);
  });

  it('keeps a newer recorded boundary when the loaded history is incomplete', () => {
    const sessions = [
      session('rest', 0, 9 * HOUR),
      session('driving', 9 * HOUR, 11 * HOUR),
      session('driving', 20 * HOUR, 22 * HOUR),
    ];
    expect(computeCounters(sessions, 22 * HOUR, 20 * HOUR).dailyDriving).toBe(
      2 * HOUR,
    );
  });

  it('clips a closed session at Monday midnight', () => {
    const monday = new Date(2026, 5, 15).getTime();
    const sessions = [session('driving', monday - 2 * HOUR, monday + 2 * HOUR)];
    expect(
      computeCounters(sessions, monday + 3 * HOUR, null).weeklyDriving,
    ).toBe(2 * HOUR);
  });

  it.each([
    { month: 2, day: 29, hours: 3 },
    { month: 9, day: 25, hours: 5 },
  ])(
    'counts actual elapsed time across the clock change in month $month',
    ({ month, day, hours }) => {
      const sessions = [
        session(
          'driving',
          new Date(2026, month, day).getTime(),
          new Date(2026, month, day, 4).getTime(),
        ),
      ];
      expect(
        computeCounters(sessions, new Date(2026, month, day, 6).getTime(), null)
          .weeklyDriving,
      ).toBe(hours * HOUR);
    },
  );
});

describe('computeCounters — biweeklyDriving', () => {
  // Weeks run Mon–Sun. For Wed 17 Jun 2026 the legal window is the current week
  // (from Mon 15 Jun) plus the previous one (from Mon 8 Jun).
  const WED_NOON = new Date(2026, 5, 17, 12, 0, 0).getTime();

  it('spans the current and previous calendar week only', () => {
    const sessions = [
      // Fri 5 Jun — two weeks back, outside the window.
      session(
        'driving',
        new Date(2026, 5, 5, 9, 0, 0).getTime(),
        new Date(2026, 5, 5, 16, 0, 0).getTime(),
      ),
      // Wed 10 Jun — previous week, inside.
      session(
        'driving',
        new Date(2026, 5, 10, 9, 0, 0).getTime(),
        new Date(2026, 5, 10, 15, 0, 0).getTime(),
      ),
      // Tue 16 Jun — current week, inside.
      session(
        'driving',
        new Date(2026, 5, 16, 9, 0, 0).getTime(),
        new Date(2026, 5, 16, 13, 0, 0).getTime(),
      ),
    ];
    const { biweeklyDriving } = computeCounters(sessions, WED_NOON, null);
    expect(biweeklyDriving).toBe(10 * HOUR);
  });

  it('excludes a rolling-14-day session that falls in a third week', () => {
    // Wed 3 Jun is within 14 days of Wed 17 Jun, but belongs to the week of
    // Mon 1 Jun — a third calendar week, so it must not count.
    const sessions = [
      session(
        'driving',
        new Date(2026, 5, 3, 9, 0, 0).getTime(),
        new Date(2026, 5, 3, 17, 0, 0).getTime(),
      ),
    ];
    const { biweeklyDriving } = computeCounters(sessions, WED_NOON, null);
    expect(biweeklyDriving).toBe(0);
  });

  it('clips a session that straddles the window start', () => {
    // Sun 7 Jun 22:00 → Mon 8 Jun 02:00; only the part from Monday counts.
    const sessions = [
      session(
        'driving',
        new Date(2026, 5, 7, 22, 0, 0).getTime(),
        new Date(2026, 5, 8, 2, 0, 0).getTime(),
      ),
    ];
    const { biweeklyDriving } = computeCounters(sessions, WED_NOON, null);
    expect(biweeklyDriving).toBe(2 * HOUR);
  });
});
