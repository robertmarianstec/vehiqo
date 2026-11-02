import type { WorkSession } from '@/db/types';
import { getDailyDrivingPeriods } from '@/utils/workTime';

function isTime(value: number): boolean {
  return Number.isFinite(value) && Number.isFinite(new Date(value).getTime());
}

export function hasContinuousCoverage(
  sessions: WorkSession[],
  from: number,
  to: number,
): boolean {
  if (!isTime(from) || !isTime(to) || to < from) return false;
  if (from === to) return true;

  const intervals: { start: number; end: number }[] = [];
  for (const session of sessions) {
    const start = session.started_at;
    const end = session.ended_at;
    if (!isTime(start) || (end !== null && (!isTime(end) || end < start))) {
      return false;
    }
    if (start >= to || (end !== null && end <= from)) continue;
    if (end === start) continue;
    intervals.push({
      start: Math.max(start, from),
      end: Math.min(end ?? to, to),
    });
  }
  intervals.sort((a, b) => a.start - b.start);
  let coveredUntil = from;
  for (const interval of intervals) {
    if (interval.start > coveredUntil) return false;
    coveredUntil = Math.max(coveredUntil, interval.end);
    if (coveredUntil >= to) return true;
  }
  return false;
}

// Missing weekly history cannot establish that a daily extension is unused.
export function hasKnownExtensionHistory(
  sessions: WorkSession[],
  weekStart: number,
  currentPeriodStart: number | null,
  now: number,
): boolean {
  if (
    currentPeriodStart === null ||
    ![weekStart, currentPeriodStart, now].every(isTime) ||
    weekStart > now ||
    currentPeriodStart > now
  ) {
    return false;
  }
  const positive = sessions.filter(
    (session) =>
      session.ended_at === null || session.ended_at !== session.started_at,
  );
  const rests = positive.filter((session) => session.mode === 'rest');
  return getDailyDrivingPeriods(positive, now).some(({ start }) => {
    if (start > currentPeriodStart || start > now) return false;
    const anchored =
      start <= weekStart || hasContinuousCoverage(rests, weekStart, start);
    return (
      anchored && hasContinuousCoverage(positive, start, currentPeriodStart)
    );
  });
}
