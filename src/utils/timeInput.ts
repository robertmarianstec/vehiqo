export function readTimeParts(hours: string, minutes: string) {
  if (!/^\d{1,2}$/.test(hours) || !/^\d{1,2}$/.test(minutes)) return null;
  const hour = Number(hours),
    minute = Number(minutes);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

export function pastedTime(text: string) {
  const value = text.trim();
  const separated = /^(\d{1,2}):(\d{1,2})$/.exec(value);
  const hours =
    separated?.[1] ?? (/^\d{4}$/.test(value) ? value.slice(0, 2) : '');
  const minutes =
    separated?.[2] ?? (/^\d{4}$/.test(value) ? value.slice(2) : '');
  const parsed = readTimeParts(hours, minutes);
  return parsed
    ? {
        hours: String(parsed.hour).padStart(2, '0'),
        minutes: String(parsed.minute).padStart(2, '0'),
      }
    : null;
}
