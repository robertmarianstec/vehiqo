import {
  formatLocalSleepTime,
  getLocalSleepTimeOptions,
  getSleepHistory,
  getSleepUtcOffset,
} from '../fatigue';

it('parses local dates strictly and rejects skipped spring times and invalid calendar dates', () => {
  expect(getLocalSleepTimeOptions('04.11.2026', '06:10')).toEqual([
    new Date(2026, 10, 4, 6, 10).getTime(),
  ]);
  for (const [date, time] of [
    ['29.03.2026', '02:30'],
    ['31.02.2026', '10:00'],
    ['01.13.2026', '10:00'],
    ['04.11.2026', '24:00'],
    ['', '06:00'],
  ])
    expect(() => getLocalSleepTimeOptions(date, time)).toThrow('invalidTime');
});

it('returns both autumn occurrences with distinct offsets and round-trips the date', () => {
  const options = getLocalSleepTimeOptions('25.10.2026', '02:30');
  expect(options).toHaveLength(2);
  expect(options[1] - options[0]).toBe(3600000);
  expect(options.map(getSleepUtcOffset)).toEqual(['UTC+02:00', 'UTC+01:00']);
  expect(formatLocalSleepTime(options[1])).toEqual({
    date: '25.10.2026',
    time: '02:30',
  });
});

it('groups real elapsed sleep by wake date, sums naps and preserves unknown days across DST', () => {
  const at = (day: number, hour: number) =>
    new Date(2026, 9, day, hour).getTime();
  const entry = (id: string, start: number, end: number | null) => ({
    id,
    slept_at: start,
    woke_at: end,
    created_at: start,
    updated_at: end ?? start,
  });
  const history = getSleepHistory(
    [
      entry('night', at(24, 22), at(25, 6)),
      entry('nap', at(25, 12), at(25, 13)),
      entry('open', at(25, 15), null),
    ],
    at(25, 16),
  );
  expect(history).toHaveLength(7);
  expect(history[0].totalMs).toBe(10 * 3600000);
  expect(history[0].entries).toHaveLength(2);
  expect(history[1].totalMs).toBeNull();
  expect(new Date(history[0].startedAt).getHours()).toBe(0);
});
