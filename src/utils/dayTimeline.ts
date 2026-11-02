import type { WorkMode, WorkSession } from '@/db/types';

export interface DaySegment {
  mode: WorkMode;
  start: number;
  end: number;
}

// Clips work sessions to a single day window [dayStart, dayEnd) for the daily
// timeline chart. Ongoing sessions (ended_at null) are treated as ending now,
// itself clamped to the window. Sessions with no overlap are dropped; the
// result is sorted by start time.
export function getDaySegments(
  sessions: WorkSession[],
  dayStart: number,
  dayEnd: number,
  now: number,
): DaySegment[] {
  const segments: DaySegment[] = [];
  for (const session of sessions) {
    const start = Math.max(session.started_at, dayStart);
    const end = Math.min(session.ended_at ?? now, dayEnd, now);
    if (end > start) {
      segments.push({ mode: session.mode, start, end });
    }
  }
  return segments.sort((a, b) => a.start - b.start);
}

export interface DayBounds {
  dayStart: number;
  dayEnd: number;
}

// Local-calendar-day window containing `now`, for the daily timeline chart.
export function getDayBounds(now: number): DayBounds {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return { dayStart: start.getTime(), dayEnd: end.getTime() };
}

// Start of the local calendar week containing `now`. EU 561/2006 defines a week
// as Monday 00:00 – Sunday 24:00, so the week starts on Monday rather than on
// JavaScript's default Sunday.
export function getWeekStart(now: number): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start.getTime();
}
