import {
  DAILY_REST_REDUCED_MS,
  MAX_DAILY_DRIVING_EXTENDED_MS,
  MAX_DAILY_DRIVING_REGULAR_MS,
  MAX_EXTENDED_DAILY_DRIVES_PER_WEEK,
  REQUIRED_BREAK_MS,
  SPLIT_BREAK_FIRST_MS,
  SPLIT_BREAK_SECOND_MS,
} from '@/constants/euRegulations';
import type { WorkMode, WorkSession } from '@/db/types';
import { getWarningLevel, type WarningLevel } from '@/utils/compliance';
import { getDayBounds } from '@/utils/dayTimeline';

// Sums time spent in `mode` that overlaps the [from, to) range.
// Each session is clipped to the range boundaries.
// Ongoing sessions (ended_at null) are treated as ending at `to`.
export function sumModeTimeInRange(
  sessions: WorkSession[],
  mode: WorkMode,
  from: number,
  to: number,
): number {
  let total = 0;
  for (const session of sessions) {
    if (session.mode !== mode) continue;
    const start = Math.max(session.started_at, from);
    const end = Math.min(session.ended_at ?? to, to);
    if (end > start) {
      total += end - start;
    }
  }
  return total;
}

// Both recovery modes use the art. 7 break thresholds for this counter;
// selecting rest alone does not complete a qualifying interruption of driving.
export function getDrivingSinceLastBreak(
  sessions: WorkSession[],
  now: number,
): number {
  const ordered = [...sessions].sort((a, b) => a.started_at - b.started_at);
  let accumulated = 0;
  let pendingFirstBreak = false;

  for (let index = 0; index < ordered.length; index += 1) {
    const session = ordered[index];
    let end = session.ended_at ?? now;

    if (session.mode === 'break' || session.mode === 'rest') {
      // Changing the label does not interrupt a continuous off-duty period.
      let next = ordered[index + 1];
      while (
        next &&
        (next.mode === 'break' || next.mode === 'rest') &&
        next.started_at === end
      ) {
        end = next.ended_at ?? now;
        index += 1;
        next = ordered[index + 1];
      }

      const duration = end - session.started_at;
      if (duration >= REQUIRED_BREAK_MS) {
        accumulated = 0;
        pendingFirstBreak = false;
      } else if (duration >= SPLIT_BREAK_SECOND_MS && pendingFirstBreak) {
        accumulated = 0;
        pendingFirstBreak = false;
      } else if (duration >= SPLIT_BREAK_FIRST_MS) {
        pendingFirstBreak = true;
      }
    } else if (session.mode === 'driving') {
      accumulated += end - session.started_at;
    }
  }

  return accumulated;
}

type RestPeriod = Pick<WorkSession, 'started_at' | 'ended_at'>;

// Gaps and other activities interrupt a rest, even when its records are nearby.
function getContinuousRestPeriods(sessions: WorkSession[]): RestPeriod[] {
  const periods: RestPeriod[] = [];
  let current: RestPeriod | undefined;
  for (const session of [...sessions].sort(
    (a, b) => a.started_at - b.started_at,
  )) {
    if (session.mode !== 'rest') {
      current = undefined;
      continue;
    }
    if (current && current.ended_at === session.started_at) {
      current.ended_at = session.ended_at;
    } else {
      current = { started_at: session.started_at, ended_at: session.ended_at };
      periods.push(current);
    }
  }
  return periods;
}

export interface DailyDrivingPeriod {
  start: number;
  end: number;
}

// EU 561/2006 art. 4(k): a daily driving period runs between two daily rests,
// not across a calendar day. Boundaries here are rests long enough to qualify
// as a daily rest; driving recorded before the first such rest belongs to a
// period whose start is unknown, so it is not returned.
export function getDailyDrivingPeriods(
  sessions: WorkSession[],
  now: number,
): DailyDrivingPeriod[] {
  const qualifyingRests = getContinuousRestPeriods(sessions).filter(
    (rest) => (rest.ended_at ?? now) - rest.started_at >= DAILY_REST_REDUCED_MS,
  );

  const periods: DailyDrivingPeriod[] = [];
  for (let i = 0; i < qualifyingRests.length; i += 1) {
    const start = qualifyingRests[i].ended_at;
    // An ongoing final rest has not ended, so no period starts from it yet.
    if (start === null) continue;
    periods.push({ start, end: qualifyingRests[i + 1]?.started_at ?? now });
  }
  return periods;
}

// Reuse the period boundaries used for extensions; persisted metadata can be
// missing or older than the session history, or newer than the loaded history.
export function getCurrentDailyDrivingStart(
  sessions: WorkSession[],
  now: number,
  lastDailyRestEnd: number | null,
): number {
  const historyStart = getDailyDrivingPeriods(sessions, now).at(-1)?.start;
  if (historyStart === undefined) {
    return lastDailyRestEnd ?? getDayBounds(now).dayStart;
  }
  return Math.max(historyStart, lastDailyRestEnd ?? historyStart);
}

// How many of the week's two permitted 10h extensions are already spent.
// Only periods that both began this week and ended before the current one are
// counted — the period in progress is what the caller is deciding about.
//
// A period is assigned to the week it STARTED in. Neither the regulation nor
// the Commission guidance resolves a period straddling Sunday midnight, so this
// is a documented assumption, not a settled rule.
export function countExtensionsUsedThisWeek(
  sessions: WorkSession[],
  weekStart: number,
  currentPeriodStart: number,
  now: number,
): number {
  let used = 0;
  for (const period of getDailyDrivingPeriods(sessions, now)) {
    if (period.start < weekStart || period.start >= currentPeriodStart)
      continue;
    const driving = sumModeTimeInRange(
      sessions,
      'driving',
      period.start,
      Math.min(period.end, currentPeriodStart),
    );
    if (driving > MAX_DAILY_DRIVING_REGULAR_MS) used += 1;
  }
  return used;
}

export interface DailyDrivingStatus {
  level: WarningLevel | null;
  /** Driving has passed 9h on an extension the driver still had available. */
  extensionInUse: boolean;
  extensionsUsed: number;
  /**
   * The limit this period is measured against. Stays at 9h until driving
   * actually passes it — showing 10h up front would present the exception as
   * the norm — and once an extension applies it stays at 10h even after that
   * is exceeded, so the figure doesn't drop back and hide what was overrun.
   */
  limit: number;
}

// EU 561/2006 art. 6(1): 9h is the norm, extendable to 10h at most twice a week.
// Passing 9h while an extension remains is a warning, not a violation — calling
// it one would be a false alarm, and a driver who learns the app cries wolf
// stops believing it when it is right.
export function getDailyDrivingStatus(
  driving: number,
  extensionsUsed: number,
): DailyDrivingStatus {
  const extensionAvailable =
    extensionsUsed < MAX_EXTENDED_DAILY_DRIVES_PER_WEEK;

  if (driving > MAX_DAILY_DRIVING_REGULAR_MS) {
    const limit = extensionAvailable
      ? MAX_DAILY_DRIVING_EXTENDED_MS
      : MAX_DAILY_DRIVING_REGULAR_MS;
    const withinExtension =
      extensionAvailable && driving <= MAX_DAILY_DRIVING_EXTENDED_MS;
    return {
      level: withinExtension ? 'warning' : 'danger',
      extensionInUse: withinExtension,
      extensionsUsed: extensionAvailable ? extensionsUsed + 1 : extensionsUsed,
      limit,
    };
  }

  return {
    level: getWarningLevel(driving, MAX_DAILY_DRIVING_REGULAR_MS),
    extensionInUse: false,
    extensionsUsed,
    limit: MAX_DAILY_DRIVING_REGULAR_MS,
  };
}

// Returns the end timestamp of the most recent continuous rest lasting at least
// `minDurationMs`, or null if no qualifying rest is found.
// Ongoing rest sessions are treated as ending at `now`.
export function getLastRestPeriodEnd(
  sessions: WorkSession[],
  minDurationMs: number,
  now: number,
): number | null {
  const ordered = getContinuousRestPeriods(sessions).reverse();
  for (const session of ordered) {
    const end = session.ended_at ?? now;
    if (end - session.started_at >= minDurationMs) return end;
  }
  return null;
}
