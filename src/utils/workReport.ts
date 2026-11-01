import type { WorkMode, WorkSession } from '@/db/types';
import { getDayBounds } from '@/utils/dayTimeline';
import { sumModeTimeInRange } from '@/utils/workTime';

export interface WorkReportDay {
  dayStart: number;
  from: number;
  to: number;
  durations: Record<WorkMode, number>;
  unrecorded: number;
}

// Report rows follow calendar dates, independently of driving-period resets.
// The last row stops at generation time; unrecorded time is never inferred as rest.
export function getWorkReportDays(
  sessions: WorkSession[],
  from: number,
  to: number,
  now: number,
): WorkReportDay[] {
  if (
    ![from, to, now].every((time) =>
      Number.isFinite(new Date(time).getTime()),
    ) ||
    to <= from
  ) {
    throw new RangeError('Invalid work report range');
  }
  const reportEnd = Math.min(to, now);
  if (reportEnd <= from) return [];

  const intervals = sessions
    .map((session) => ({
      start: Math.max(session.started_at, from),
      end: Math.min(session.ended_at ?? now, reportEnd),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index].start < intervals[index - 1].end) {
      throw new Error('Overlapping work sessions in report range');
    }
  }

  const days: WorkReportDay[] = [];
  for (
    let dayStart = getDayBounds(from).dayStart;
    dayStart < reportEnd;
    dayStart = getDayBounds(dayStart).dayEnd
  ) {
    const rowFrom = Math.max(from, dayStart);
    const rowTo = Math.min(reportEnd, getDayBounds(dayStart).dayEnd);
    const durations: Record<WorkMode, number> = {
      driving: sumModeTimeInRange(sessions, 'driving', rowFrom, rowTo),
      other_work: sumModeTimeInRange(sessions, 'other_work', rowFrom, rowTo),
      standby: sumModeTimeInRange(sessions, 'standby', rowFrom, rowTo),
      break: sumModeTimeInRange(sessions, 'break', rowFrom, rowTo),
      rest: sumModeTimeInRange(sessions, 'rest', rowFrom, rowTo),
    };
    const recorded = Object.values(durations).reduce(
      (sum, time) => sum + time,
      0,
    );
    days.push({
      dayStart,
      from: rowFrom,
      to: rowTo,
      durations,
      unrecorded: rowTo - rowFrom - recorded,
    });
  }
  return days;
}
