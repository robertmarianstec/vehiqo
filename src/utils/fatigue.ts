import type { FatigueSnapshot, SleepEntry } from '@/db/types';

export type FatigueErrorCode =
  | 'invalidTime'
  | 'futureTime'
  | 'invalidOrder'
  | 'overlap'
  | 'afterWake'
  | 'invalidState'
  | 'stale'
  | 'clockChanged'
  | 'ambiguousTime';

export class FatigueError extends Error {
  constructor(public readonly code: FatigueErrorCode) {
    super(code);
    this.name = 'FatigueError';
  }
}

export function validateFatigueTime(value: number, now: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Number.isFinite(new Date(value).getTime())
  )
    throw new FatigueError('invalidTime');
  if (value > now) throw new FatigueError('futureTime');
}

export function validateFatigueSnapshot(
  snapshot: FatigueSnapshot,
  now: number,
): void {
  validateFatigueTime(now, now);
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0)
    throw new FatigueError('invalidState');
  if (
    snapshot.revision === 0
      ? snapshot.generation !== null
      : !snapshot.generation || typeof snapshot.generation !== 'string'
  )
    throw new FatigueError('invalidState');
  validateFatigueTime(snapshot.updatedAt, now);
  if (snapshot.wokeAt !== null)
    validateFatigueTime(snapshot.wokeAt, snapshot.updatedAt);
  let previousEnd = 0;
  let previousOpen = false;
  const ids = new Set<string>();
  for (const entry of snapshot.entries) {
    validateFatigueTime(entry.slept_at, now);
    validateFatigueTime(entry.created_at, snapshot.updatedAt);
    validateFatigueTime(entry.updated_at, snapshot.updatedAt);
    if (
      !entry.id ||
      ids.has(entry.id) ||
      entry.updated_at < entry.created_at ||
      previousOpen ||
      entry.slept_at < previousEnd
    )
      throw new FatigueError('invalidState');
    ids.add(entry.id);
    if (entry.woke_at !== null) {
      validateFatigueTime(entry.woke_at, now);
      if (entry.woke_at <= entry.slept_at)
        throw new FatigueError('invalidState');
      previousEnd = entry.woke_at;
    } else {
      previousOpen = true;
      if (snapshot.wokeAt === null || entry.slept_at < snapshot.wokeAt)
        throw new FatigueError('invalidState');
    }
  }
  if (
    (snapshot.entries.length > 0 && snapshot.wokeAt === null) ||
    (snapshot.wokeAt !== null && snapshot.wokeAt < previousEnd)
  )
    throw new FatigueError('invalidState');
}

export function getSleepHistory(entries: SleepEntry[], now: number) {
  return Array.from({ length: 7 }, (_, index) => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - index);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const periods = entries.filter(
      (entry) =>
        entry.woke_at !== null &&
        entry.woke_at >= start.getTime() &&
        entry.woke_at < end.getTime(),
    );
    return {
      startedAt: start.getTime(),
      entries: periods,
      totalMs: periods.length
        ? periods.reduce(
            (sum, entry) => sum + entry.woke_at! - entry.slept_at,
            0,
          )
        : null,
    };
  });
}

export function formatLocalSleepTime(timestamp: number) {
  const value = new Date(timestamp);
  const pad = (part: number) => String(part).padStart(2, '0');
  return {
    date: `${pad(value.getDate())}.${pad(value.getMonth() + 1)}.${value.getFullYear()}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

export function getLocalSleepTimeOptions(date: string, time: string): number[] {
  const parts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date.trim());
  const clock = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!parts || !clock) throw new FatigueError('invalidTime');
  const [day, month, year, hour, minute] = [
    Number(parts[1]),
    Number(parts[2]),
    Number(parts[3]),
    Number(clock[1]),
    Number(clock[2]),
  ];
  if (
    year < 1970 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  )
    throw new FatigueError('invalidTime');
  const base = new Date(year, month - 1, day, hour, minute).getTime();
  const offsets = new Set(
    [-86400000, 0, 86400000].map((delta) =>
      new Date(base + delta).getTimezoneOffset(),
    ),
  );
  const candidates = [...offsets]
    .map(
      (offset) => Date.UTC(year, month - 1, day, hour, minute) + offset * 60000,
    )
    .filter((timestamp) => {
      const value = new Date(timestamp);
      return (
        value.getFullYear() === year &&
        value.getMonth() === month - 1 &&
        value.getDate() === day &&
        value.getHours() === hour &&
        value.getMinutes() === minute
      );
    })
    .sort((a, b) => a - b);
  if (!candidates.length) throw new FatigueError('invalidTime');
  return candidates;
}

export function getSleepUtcOffset(timestamp: number): string {
  const offset = -new Date(timestamp).getTimezoneOffset();
  return `UTC${offset >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
}
