import type { WorkMode, WorkSession } from '@/db/types';
import {
  getWorkReportDays,
  getWorkReportRange,
  getWorkReportTotals,
  shiftWorkReportPeriod,
} from '@/utils/workReport';

const HOUR = 3_600_000;
const MONDAY = new Date(2026, 5, 15).getTime();

it.each([
  { month: 2, day: 29, fromDay: 23, hours: 167 },
  { month: 9, day: 25, fromDay: 19, hours: 169 },
])(
  'uses calendar weeks across a clock change ($hours hours)',
  ({ month, day, fromDay, hours }) => {
    const range = getWorkReportRange(
      new Date(2026, month, day, 12).getTime(),
      'week',
    );
    expect(range.from).toBe(new Date(2026, month, fromDay).getTime());
    expect(range.to - range.from).toBe(hours * HOUR);
    expect(shiftWorkReportPeriod(range.from, 'week', 1)).toBe(range.to);
  },
);

it('moves across leap-year months and the year boundary without skipping dates', () => {
  const january = new Date(2028, 0, 31, 18).getTime();
  const february = shiftWorkReportPeriod(january, 'month', 1);
  expect(getWorkReportRange(february, 'month')).toEqual({
    from: new Date(2028, 1, 1).getTime(),
    to: new Date(2028, 2, 1).getTime(),
  });
  expect(shiftWorkReportPeriod(january, 'month', -1)).toBe(
    new Date(2027, 11, 1).getTime(),
  );
});

it('totals activities and missing time across report rows without changing them', () => {
  const days = getWorkReportDays(
    [session('driving', MONDAY + 23 * HOUR, MONDAY + 25 * HOUR)],
    MONDAY,
    MONDAY + 48 * HOUR,
    MONDAY + 48 * HOUR,
  );
  const before = JSON.stringify(days);
  expect(getWorkReportTotals(days)).toEqual({
    durations: {
      driving: 2 * HOUR,
      other_work: 0,
      standby: 0,
      break: 0,
      rest: 0,
    },
    unrecorded: 46 * HOUR,
  });
  expect(JSON.stringify(days)).toBe(before);
  expect(getWorkReportTotals([]).unrecorded).toBe(0);
});

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

it('splits a continuous activity at midnight without resetting the source record', () => {
  const sessions = [session('driving', MONDAY + 22 * HOUR, MONDAY + 27 * HOUR)];
  const before = JSON.stringify(sessions);
  const days = getWorkReportDays(
    sessions,
    MONDAY,
    MONDAY + 48 * HOUR,
    MONDAY + 48 * HOUR,
  );
  expect(days.map((day) => day.durations.driving)).toEqual([
    2 * HOUR,
    3 * HOUR,
  ]);
  expect(days.map((day) => day.unrecorded)).toEqual([22 * HOUR, 21 * HOUR]);
  expect(JSON.stringify(sessions)).toBe(before);
});

it('rejects invalid recorded timestamps instead of reporting the time as missing data', () => {
  expect(() =>
    getWorkReportDays(
      [session('driving', Number.NaN, MONDAY + HOUR)],
      MONDAY,
      MONDAY + 24 * HOUR,
      MONDAY + 24 * HOUR,
    ),
  ).toThrow();
});

it('keeps all five activities separate and distinguishes missing data from rest', () => {
  const sessions = [
    session('driving', MONDAY, MONDAY + HOUR),
    session('other_work', MONDAY + HOUR, MONDAY + 3 * HOUR),
    session('standby', MONDAY + 3 * HOUR, MONDAY + 6 * HOUR),
    session('break', MONDAY + 6 * HOUR, MONDAY + 7 * HOUR),
    session('rest', MONDAY + 8 * HOUR, MONDAY + 12 * HOUR),
  ];
  const [day] = getWorkReportDays(
    sessions.reverse(),
    MONDAY,
    MONDAY + 24 * HOUR,
    MONDAY + 24 * HOUR,
  );
  expect(day.durations).toEqual({
    driving: HOUR,
    other_work: 2 * HOUR,
    standby: 3 * HOUR,
    break: HOUR,
    rest: 4 * HOUR,
  });
  expect(day.unrecorded).toBe(13 * HOUR);
});

it('clips activity to the selected report range', () => {
  const sessions = [session('rest', MONDAY - HOUR, MONDAY + 30 * HOUR)];
  const [day] = getWorkReportDays(
    sessions,
    MONDAY + HOUR,
    MONDAY + 4 * HOUR,
    MONDAY + 48 * HOUR,
  );
  expect(day).toMatchObject({
    dayStart: MONDAY,
    from: MONDAY + HOUR,
    to: MONDAY + 4 * HOUR,
    unrecorded: 0,
  });
  expect(day.durations.rest).toBe(3 * HOUR);
});

it('stops an ongoing session and the report at generation time', () => {
  const now = MONDAY + 5 * HOUR;
  const [day] = getWorkReportDays(
    [session('driving', MONDAY + 2 * HOUR, null)],
    MONDAY,
    MONDAY + 7 * 24 * HOUR,
    now,
  );
  expect(day.to).toBe(now);
  expect(day.durations.driving).toBe(3 * HOUR);
  expect(day.unrecorded).toBe(2 * HOUR);
});

it('does not count a closed record beyond generation time', () => {
  const [day] = getWorkReportDays(
    [session('driving', MONDAY, MONDAY + 5 * HOUR)],
    MONDAY,
    MONDAY + 24 * HOUR,
    MONDAY + HOUR,
  );
  expect(day.durations.driving).toBe(HOUR);
  expect(day.unrecorded).toBe(0);
});

it.each([
  { date: [2026, 2, 29], hours: 23 },
  { date: [2026, 9, 25], hours: 25 },
])('uses the actual $hours-hour day at a clock change', ({ date, hours }) => {
  const start = new Date(date[0], date[1], date[2]).getTime();
  const end = new Date(date[0], date[1], date[2] + 1).getTime();
  const [recorded] = getWorkReportDays(
    [session('rest', start, end)],
    start,
    end,
    end,
  );
  expect(recorded.durations.rest).toBe(hours * HOUR);
  expect(recorded.unrecorded).toBe(0);
  const [empty] = getWorkReportDays([], start, end, end);
  expect(empty.unrecorded).toBe(hours * HOUR);
  expect(empty.durations.rest).toBe(0);
});

it('includes every date of a leap-year February, with missing data kept explicit', () => {
  const from = new Date(2028, 1, 1).getTime();
  const to = new Date(2028, 2, 1).getTime();
  const days = getWorkReportDays([], from, to, to);
  expect(days).toHaveLength(29);
  expect(days[28].dayStart).toBe(new Date(2028, 1, 29).getTime());
  expect(days.every((day) => day.unrecorded === 24 * HOUR)).toBe(true);
});

it('returns no elapsed days for a future report', () => {
  expect(
    getWorkReportDays([], MONDAY + HOUR, MONDAY + 24 * HOUR, MONDAY),
  ).toEqual([]);
});

it('rejects overlapping records instead of producing a misleading total', () => {
  expect(() =>
    getWorkReportDays(
      [
        session('driving', MONDAY, MONDAY + 2 * HOUR),
        session('rest', MONDAY + HOUR, MONDAY + 3 * HOUR),
      ],
      MONDAY,
      MONDAY + 24 * HOUR,
      MONDAY + 24 * HOUR,
    ),
  ).toThrow('Overlapping work sessions');
});

it.each([
  [MONDAY, MONDAY, MONDAY],
  [MONDAY + HOUR, MONDAY, MONDAY],
  [NaN, MONDAY, MONDAY],
  [MONDAY, Infinity, MONDAY],
])('rejects an invalid report range (%s, %s, %s)', (from, to, now) => {
  expect(() => getWorkReportDays([], from, to, now)).toThrow(RangeError);
});
