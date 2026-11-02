import type { WorkSession } from '@/db/types';

function isTimestamp(value: number): boolean {
  return (
    Number.isSafeInteger(value) && Number.isFinite(new Date(value).getTime())
  );
}

export function assertValidWorkSessions(sessions: WorkSession[]): void {
  const intervals: { start: number; end: number }[] = [];
  for (const session of sessions) {
    const start = session.started_at;
    const end = session.ended_at;
    if (!isTimestamp(start) || (end !== null && !isTimestamp(end))) {
      throw new RangeError('Invalid work session timestamp');
    }
    if (end !== null && end < start) {
      throw new RangeError('Work session end precedes its start');
    }
    if (end === start) continue;
    intervals.push({ start, end: end ?? Infinity });
  }
  intervals.sort((a, b) => a.start - b.start);
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index].start < intervals[index - 1].end) {
      throw new Error('Overlapping work sessions');
    }
  }
}
