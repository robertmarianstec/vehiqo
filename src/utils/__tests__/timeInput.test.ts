import { pastedTime, readTimeParts } from '../timeInput';

it('accepts 24-hour limits and single-digit parts without silently clamping invalid times', () => {
  expect(readTimeParts('0', '0')).toEqual({ hour: 0, minute: 0 });
  expect(readTimeParts('23', '59')).toEqual({ hour: 23, minute: 59 });
  for (const [hour, minute] of [
    ['24', '00'],
    ['29', '10'],
    ['12', '60'],
    ['', '00'],
    ['0', ''],
    ['a', '15'],
    ['-1', '00'],
  ])
    expect(readTimeParts(hour, minute)).toBeNull();
});

it('accepts complete pasted times with or without a colon, but rejects invalid input', () => {
  expect(pastedTime('06:37')).toEqual({ hours: '06', minutes: '37' });
  expect(pastedTime('0637')).toEqual({ hours: '06', minutes: '37' });
  expect(pastedTime('6:7')).toEqual({ hours: '06', minutes: '07' });
  for (const text of ['24:00', '12:60', '12345', 'abc', '6', '06'])
    expect(pastedTime(text)).toBeNull();
});
