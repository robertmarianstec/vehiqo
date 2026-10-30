import type { WorkMode, WorkSession } from '@/db/types';
import {
  countExtensionsUsedThisWeek,
  getDailyDrivingPeriods,
  getDailyDrivingStatus,
  getDrivingSinceLastBreak,
  getLastRestPeriodEnd,
  sumModeTimeInRange,
} from '@/utils/workTime';

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

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

describe('sumModeTimeInRange', () => {
  const FROM = 100;
  const TO = 200;

  it('returns 0 for no sessions', () => {
    expect(sumModeTimeInRange([], 'driving', FROM, TO)).toBe(0);
  });

  it('sums a session fully inside the range', () => {
    expect(
      sumModeTimeInRange([session('driving', 120, 150)], 'driving', FROM, TO),
    ).toBe(30);
  });

  it('clips a session that starts before the range', () => {
    expect(
      sumModeTimeInRange([session('driving', 50, 150)], 'driving', FROM, TO),
    ).toBe(50);
  });

  it('clips a session that ends after the range', () => {
    expect(
      sumModeTimeInRange([session('driving', 150, 250)], 'driving', FROM, TO),
    ).toBe(50);
  });

  it('clips a session overhanging both ends', () => {
    expect(
      sumModeTimeInRange([session('driving', 50, 250)], 'driving', FROM, TO),
    ).toBe(100);
  });

  it('treats an ongoing session as ending at `to`', () => {
    expect(
      sumModeTimeInRange([session('driving', 150, null)], 'driving', FROM, TO),
    ).toBe(50);
  });

  it('ignores sessions of a different mode', () => {
    expect(
      sumModeTimeInRange(
        [session('other_work', 120, 150)],
        'driving',
        FROM,
        TO,
      ),
    ).toBe(0);
  });

  it('ignores sessions entirely outside the range', () => {
    expect(
      sumModeTimeInRange([session('driving', 10, 50)], 'driving', FROM, TO),
    ).toBe(0);
  });

  it('sums multiple sessions of the same mode', () => {
    const sessions = [
      session('driving', 100, 120),
      session('driving', 140, 160),
    ];
    expect(sumModeTimeInRange(sessions, 'driving', FROM, TO)).toBe(40);
  });

  it('sums only the requested mode when modes are mixed', () => {
    const sessions = [
      session('driving', 100, 130),
      session('break', 130, 150),
      session('driving', 150, 170),
    ];
    expect(sumModeTimeInRange(sessions, 'driving', FROM, TO)).toBe(50);
  });
});

describe('getDrivingSinceLastBreak', () => {
  it('returns 0 for no sessions', () => {
    expect(getDrivingSinceLastBreak([], 1000)).toBe(0);
  });

  it('returns the duration of a single completed driving session', () => {
    const sessions = [session('driving', 0, 2 * HOUR)];
    expect(getDrivingSinceLastBreak(sessions, 2 * HOUR)).toBe(2 * HOUR);
  });

  it('counts an ongoing driving session up to `now`', () => {
    const sessions = [session('driving', 0, null)];
    expect(getDrivingSinceLastBreak(sessions, 90 * MIN)).toBe(90 * MIN);
  });

  it('resets after a full break of exactly 45 minutes', () => {
    const sessions = [
      session('driving', 0, 2 * HOUR),
      session('break', 2 * HOUR, 2 * HOUR + 45 * MIN),
      session('driving', 2 * HOUR + 45 * MIN, 3 * HOUR + 45 * MIN),
    ];
    expect(getDrivingSinceLastBreak(sessions, 3 * HOUR + 45 * MIN)).toBe(
      1 * HOUR,
    );
  });

  it('does NOT reset after a break shorter than 45 minutes', () => {
    const sessions = [
      session('driving', 0, 2 * HOUR),
      session('break', 2 * HOUR, 2 * HOUR + 44 * MIN),
      session('driving', 2 * HOUR + 44 * MIN, 3 * HOUR + 44 * MIN),
    ];
    expect(getDrivingSinceLastBreak(sessions, 3 * HOUR + 44 * MIN)).toBe(
      3 * HOUR,
    );
  });

  it('resets after a rest period', () => {
    const sessions = [
      session('driving', 0, 3 * HOUR),
      session('rest', 3 * HOUR, 12 * HOUR),
      session('driving', 12 * HOUR, 13 * HOUR),
    ];
    expect(getDrivingSinceLastBreak(sessions, 13 * HOUR)).toBe(1 * HOUR);
  });

  it.each([MIN, 45 * MIN - 1])(
    'keeps previous driving after a completed rest of %i ms',
    (duration) => {
      const restEnd = 4 * HOUR + duration;
      const now = restEnd + HOUR;
      const sessions = [
        session('driving', 0, 4 * HOUR),
        session('rest', 4 * HOUR, restEnd),
        session('driving', restEnd, now),
      ];
      expect(getDrivingSinceLastBreak(sessions, now)).toBe(5 * HOUR);
    },
  );

  it.each(['break', 'rest'] as const)(
    'resets an ongoing %s only when it reaches 45 minutes',
    (mode) => {
      const sessions = [
        session('driving', 0, 4 * HOUR),
        session(mode, 4 * HOUR, null),
      ];
      expect(getDrivingSinceLastBreak(sessions, 4 * HOUR)).toBe(4 * HOUR);
      expect(getDrivingSinceLastBreak(sessions, 4 * HOUR + 45 * MIN - 1)).toBe(
        4 * HOUR,
      );
      expect(getDrivingSinceLastBreak(sessions, 4 * HOUR + 45 * MIN)).toBe(0);
    },
  );

  it('counts only new driving after a completed 45-minute rest', () => {
    const restEnd = 4 * HOUR + 45 * MIN;
    const now = restEnd + HOUR;
    const sessions = [
      session('driving', 0, 4 * HOUR),
      session('rest', 4 * HOUR, restEnd),
      session('driving', restEnd, now),
    ];
    expect(getDrivingSinceLastBreak(sessions, now)).toBe(HOUR);
  });

  it.each([
    ['rest', 'rest'],
    ['rest', 'break'],
    ['break', 'rest'],
  ] as const)(
    'accepts a split 15 + 30 minutes using %s then %s',
    (firstMode, secondMode) => {
      const firstEnd = 2 * HOUR + 15 * MIN;
      const secondStart = firstEnd + HOUR;
      const sessions = [
        session('driving', 0, 2 * HOUR),
        session(firstMode, 2 * HOUR, firstEnd),
        session('driving', firstEnd, secondStart),
        session(secondMode, secondStart, null),
      ];
      expect(
        getDrivingSinceLastBreak(sessions, secondStart + 30 * MIN - 1),
      ).toBe(3 * HOUR);
      expect(getDrivingSinceLastBreak(sessions, secondStart + 30 * MIN)).toBe(
        0,
      );
    },
  );

  it.each([
    ['rest', 'rest'],
    ['rest', 'break'],
    ['break', 'rest'],
  ] as const)(
    'does not accept a split 30 + 15 minutes using %s then %s',
    (firstMode, secondMode) => {
      const firstEnd = 2 * HOUR + 30 * MIN;
      const secondStart = firstEnd + HOUR;
      const now = secondStart + 15 * MIN;
      const sessions = [
        session('driving', 0, 2 * HOUR),
        session(firstMode, 2 * HOUR, firstEnd),
        session('driving', firstEnd, secondStart),
        session(secondMode, secondStart, now),
      ];
      expect(getDrivingSinceLastBreak(sessions, now)).toBe(3 * HOUR);
    },
  );

  it('preserves the first split part through a short rest', () => {
    const sessions = [
      session('driving', 0, 2 * HOUR),
      session('break', 2 * HOUR, 2 * HOUR + 15 * MIN),
      session('driving', 2 * HOUR + 15 * MIN, 3 * HOUR + 15 * MIN),
      session('rest', 3 * HOUR + 15 * MIN, 3 * HOUR + 16 * MIN),
      session('driving', 3 * HOUR + 16 * MIN, 4 * HOUR + 16 * MIN),
      session('break', 4 * HOUR + 16 * MIN, 4 * HOUR + 46 * MIN),
      session('driving', 4 * HOUR + 46 * MIN, null),
    ];
    expect(getDrivingSinceLastBreak(sessions, 5 * HOUR + 46 * MIN)).toBe(HOUR);
  });

  it.each(['break', 'rest'] as const)(
    'keeps a continuous stop when switching from %s to the other recovery mode',
    (firstMode) => {
      const secondMode = firstMode === 'break' ? 'rest' : 'break';
      const sessions = [
        session('driving', 0, 4 * HOUR),
        session(firstMode, 4 * HOUR, 4 * HOUR + 20 * MIN),
        session(secondMode, 4 * HOUR + 20 * MIN, null),
      ];
      expect(getDrivingSinceLastBreak(sessions, 4 * HOUR + 45 * MIN - 1)).toBe(
        4 * HOUR,
      );
      expect(getDrivingSinceLastBreak(sessions, 4 * HOUR + 45 * MIN)).toBe(0);
    },
  );

  it.each(['break', 'rest'] as const)(
    'does not count two adjacent %s records as two separate split parts',
    (mode) => {
      const sessions = [
        session('driving', 0, 4 * HOUR),
        session(mode, 4 * HOUR, 4 * HOUR + 15 * MIN),
        session(mode, 4 * HOUR + 15 * MIN, null),
      ];
      expect(getDrivingSinceLastBreak(sessions, 4 * HOUR + 30 * MIN)).toBe(
        4 * HOUR,
      );
      expect(getDrivingSinceLastBreak(sessions, 4 * HOUR + 45 * MIN)).toBe(0);
    },
  );

  it.each(['other_work', 'standby', null] as const)(
    'does not join recovery records across %s',
    (mode) => {
      const sessions = [
        session('driving', 0, 4 * HOUR),
        session('rest', 4 * HOUR, 4 * HOUR + 20 * MIN),
        ...(mode
          ? [session(mode, 4 * HOUR + 20 * MIN, 4 * HOUR + 21 * MIN)]
          : []),
        session('break', 4 * HOUR + 21 * MIN, null),
      ];
      expect(getDrivingSinceLastBreak(sessions, 4 * HOUR + 46 * MIN)).toBe(
        4 * HOUR,
      );
    },
  );

  it('treats other work and standby as neither adding nor resetting', () => {
    const sessions = [
      session('driving', 0, 2 * HOUR),
      session('other_work', 2 * HOUR, 3 * HOUR),
      session('standby', 3 * HOUR, 4 * HOUR),
      session('driving', 4 * HOUR, 5 * HOUR),
    ];
    expect(getDrivingSinceLastBreak(sessions, 5 * HOUR)).toBe(3 * HOUR);
  });

  it('sorts unordered sessions before accumulating', () => {
    const sessions = [
      session('driving', 2 * HOUR + 45 * MIN, 3 * HOUR + 45 * MIN),
      session('driving', 0, 2 * HOUR),
      session('break', 2 * HOUR, 2 * HOUR + 45 * MIN),
    ];
    expect(getDrivingSinceLastBreak(sessions, 3 * HOUR + 45 * MIN)).toBe(
      1 * HOUR,
    );
  });

  it('resets after a split break: 15 min then 30 min with driving in between', () => {
    const sessions = [
      session('driving', 0, 2 * HOUR),
      session('break', 2 * HOUR, 2 * HOUR + 15 * MIN),
      session('driving', 2 * HOUR + 15 * MIN, 3 * HOUR + 15 * MIN),
      session('break', 3 * HOUR + 15 * MIN, 3 * HOUR + 45 * MIN),
      session('driving', 3 * HOUR + 45 * MIN, 4 * HOUR + 15 * MIN),
    ];
    expect(getDrivingSinceLastBreak(sessions, 4 * HOUR + 15 * MIN)).toBe(
      30 * MIN,
    );
  });

  it('does not reset when the first split part is shorter than 15 min', () => {
    const sessions = [
      session('driving', 0, 2 * HOUR),
      session('break', 2 * HOUR, 2 * HOUR + 10 * MIN),
      session('driving', 2 * HOUR + 10 * MIN, 3 * HOUR + 10 * MIN),
      session('break', 3 * HOUR + 10 * MIN, 3 * HOUR + 40 * MIN),
      session('driving', 3 * HOUR + 40 * MIN, 4 * HOUR + 10 * MIN),
    ];
    expect(getDrivingSinceLastBreak(sessions, 4 * HOUR + 10 * MIN)).toBe(
      3 * HOUR + 30 * MIN,
    );
  });

  it('does not reset when the second split part is shorter than 30 min', () => {
    const sessions = [
      session('driving', 0, 2 * HOUR),
      session('break', 2 * HOUR, 2 * HOUR + 30 * MIN),
      session('driving', 2 * HOUR + 30 * MIN, 3 * HOUR + 30 * MIN),
      session('break', 3 * HOUR + 30 * MIN, 3 * HOUR + 45 * MIN),
      session('driving', 3 * HOUR + 45 * MIN, 4 * HOUR + 15 * MIN),
    ];
    expect(getDrivingSinceLastBreak(sessions, 4 * HOUR + 15 * MIN)).toBe(
      3 * HOUR + 30 * MIN,
    );
  });
});

describe('getLastRestPeriodEnd', () => {
  const MIN_DURATION = 9 * HOUR; // daily rest minimum

  it('returns null when there are no sessions', () => {
    expect(getLastRestPeriodEnd([], MIN_DURATION, 100 * HOUR)).toBeNull();
  });

  it('returns null when no rest meets the minimum duration', () => {
    const sessions = [session('rest', 0, 8 * HOUR)];
    expect(getLastRestPeriodEnd(sessions, MIN_DURATION, 10 * HOUR)).toBeNull();
  });

  it('returns null when there are only non-rest sessions', () => {
    const sessions = [session('driving', 0, 10 * HOUR)];
    expect(getLastRestPeriodEnd(sessions, MIN_DURATION, 10 * HOUR)).toBeNull();
  });

  it('returns ended_at of a qualifying completed rest', () => {
    const sessions = [session('rest', 0, 11 * HOUR)];
    expect(getLastRestPeriodEnd(sessions, MIN_DURATION, 20 * HOUR)).toBe(
      11 * HOUR,
    );
  });

  it('treats ongoing rest as ending at `now`', () => {
    const sessions = [session('rest', 0, null)];
    const now = 10 * HOUR;
    expect(getLastRestPeriodEnd(sessions, MIN_DURATION, now)).toBe(now);
  });

  it('ongoing rest shorter than minimum returns null', () => {
    const sessions = [session('rest', 0, null)];
    const now = 8 * HOUR;
    expect(getLastRestPeriodEnd(sessions, MIN_DURATION, now)).toBeNull();
  });

  it('returns the most recent qualifying rest, not the earliest', () => {
    const sessions = [
      session('rest', 0, 11 * HOUR),
      session('driving', 11 * HOUR, 14 * HOUR),
      session('rest', 14 * HOUR, 25 * HOUR),
    ];
    expect(getLastRestPeriodEnd(sessions, MIN_DURATION, 30 * HOUR)).toBe(
      25 * HOUR,
    );
  });

  it('skips a short rest before a qualifying one', () => {
    const sessions = [
      session('rest', 0, 11 * HOUR),
      session('rest', 20 * HOUR, 28 * HOUR), // 8h — too short
    ];
    expect(getLastRestPeriodEnd(sessions, MIN_DURATION, 30 * HOUR)).toBe(
      11 * HOUR,
    );
  });

  it('works for weekly rest minimum (24h)', () => {
    const WEEKLY_MIN = 24 * HOUR;
    const sessions = [session('rest', 0, 25 * HOUR)];
    expect(getLastRestPeriodEnd(sessions, WEEKLY_MIN, 30 * HOUR)).toBe(
      25 * HOUR,
    );
  });
});

describe('getDailyDrivingPeriods', () => {
  it('returns nothing when no rest qualifies', () => {
    const sessions = [
      session('driving', 0, 5 * HOUR),
      session('rest', 5 * HOUR, 12 * HOUR),
    ];
    expect(getDailyDrivingPeriods(sessions, 20 * HOUR)).toEqual([]);
  });

  it('opens a period at the end of a qualifying rest and leaves it open', () => {
    const sessions = [session('rest', 0, 10 * HOUR)];
    expect(getDailyDrivingPeriods(sessions, 20 * HOUR)).toEqual([
      { start: 10 * HOUR, end: 20 * HOUR },
    ]);
  });

  it('closes a period at the start of the next qualifying rest', () => {
    const sessions = [
      session('rest', 0, 10 * HOUR),
      session('rest', 24 * HOUR, 34 * HOUR),
    ];
    expect(getDailyDrivingPeriods(sessions, 40 * HOUR)).toEqual([
      { start: 10 * HOUR, end: 24 * HOUR },
      { start: 34 * HOUR, end: 40 * HOUR },
    ]);
  });

  it('ignores rests too short to end a daily period', () => {
    const sessions = [
      session('rest', 0, 10 * HOUR),
      session('rest', 20 * HOUR, 26 * HOUR), // 6h — not a daily rest
      session('rest', 40 * HOUR, 50 * HOUR),
    ];
    expect(getDailyDrivingPeriods(sessions, 60 * HOUR)).toEqual([
      { start: 10 * HOUR, end: 40 * HOUR },
      { start: 50 * HOUR, end: 60 * HOUR },
    ]);
  });

  it('does not open a period from a rest that is still ongoing', () => {
    const sessions = [session('rest', 0, null)];
    expect(getDailyDrivingPeriods(sessions, 12 * HOUR)).toEqual([]);
  });
});

describe('countExtensionsUsedThisWeek', () => {
  const WEEK = 0;
  // Two closed periods: the first drives 10h, the second 8h.
  const sessions = [
    session('rest', 0, 10 * HOUR),
    session('driving', 10 * HOUR, 20 * HOUR), // 10h — extension
    session('rest', 20 * HOUR, 30 * HOUR),
    session('driving', 30 * HOUR, 38 * HOUR), // 8h — regular
    session('rest', 38 * HOUR, 48 * HOUR),
  ];

  it('counts only periods that passed the regular limit', () => {
    expect(
      countExtensionsUsedThisWeek(sessions, WEEK, 48 * HOUR, 60 * HOUR),
    ).toBe(1);
  });

  it('excludes the period in progress', () => {
    // Current period starts at 10h, so the 10h drive belongs to it, not history.
    expect(
      countExtensionsUsedThisWeek(sessions, WEEK, 10 * HOUR, 60 * HOUR),
    ).toBe(0);
  });

  it('excludes periods that began before this week', () => {
    expect(
      countExtensionsUsedThisWeek(sessions, 25 * HOUR, 48 * HOUR, 60 * HOUR),
    ).toBe(0);
  });

  it('treats exactly 9h as not an extension', () => {
    const exactly = [
      session('rest', 0, 10 * HOUR),
      session('driving', 10 * HOUR, 19 * HOUR),
      session('rest', 19 * HOUR, 29 * HOUR),
    ];
    expect(
      countExtensionsUsedThisWeek(exactly, WEEK, 29 * HOUR, 40 * HOUR),
    ).toBe(0);
  });
});

describe('getDailyDrivingStatus', () => {
  it('uses the regular thresholds below 9h', () => {
    expect(getDailyDrivingStatus(4 * HOUR, 0).level).toBeNull();
    expect(getDailyDrivingStatus(8.2 * HOUR, 0).level).toBe('warning');
    expect(getDailyDrivingStatus(4 * HOUR, 0).extensionInUse).toBe(false);
  });

  it('reports danger exactly at the regular limit when no extension is left', () => {
    expect(getDailyDrivingStatus(9 * HOUR, 2).level).toBe('danger');
  });

  it('warns rather than alarms past 9h while an extension remains', () => {
    const status = getDailyDrivingStatus(9.5 * HOUR, 1);
    expect(status.level).toBe('warning');
    expect(status.extensionInUse).toBe(true);
    expect(status.extensionsUsed).toBe(2);
  });

  it('counts the first extension as in use when none were spent yet', () => {
    expect(getDailyDrivingStatus(9.5 * HOUR, 0).extensionsUsed).toBe(1);
  });

  it('is a violation past 9h once both extensions are spent', () => {
    const status = getDailyDrivingStatus(9.5 * HOUR, 2);
    expect(status.level).toBe('danger');
    expect(status.extensionInUse).toBe(false);
  });

  it('is a violation past 10h even with extensions available', () => {
    const status = getDailyDrivingStatus(10.5 * HOUR, 0);
    expect(status.level).toBe('danger');
    expect(status.extensionInUse).toBe(false);
  });
});

describe('getDailyDrivingStatus — displayed limit', () => {
  it('stays at the regular limit before it is passed', () => {
    expect(getDailyDrivingStatus(8 * HOUR, 0).limit).toBe(9 * HOUR);
  });

  it('rises to the extended limit once an extension applies', () => {
    expect(getDailyDrivingStatus(9.5 * HOUR, 0).limit).toBe(10 * HOUR);
  });

  it('does not drop back once the extended limit is also exceeded', () => {
    expect(getDailyDrivingStatus(10.5 * HOUR, 0).limit).toBe(10 * HOUR);
  });

  it('stays at the regular limit when no extension is available', () => {
    expect(getDailyDrivingStatus(9.5 * HOUR, 2).limit).toBe(9 * HOUR);
  });
});
