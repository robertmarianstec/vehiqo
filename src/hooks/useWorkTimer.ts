import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import {
  BREAK_PRE_ALERT_BEFORE_LIMIT_MS,
  DRIVING_BEFORE_BREAK_MS,
  MAX_BIWEEKLY_DRIVING_MS,
  MAX_DAILY_DRIVING_REGULAR_MS,
  MAX_WEEKLY_DRIVING_MS,
} from '@/constants/euRegulations';
import {
  getCurrentWorkSession,
  getWorkSessionsInRange,
  getWorkTimerSettings,
  startWorkSession,
} from '@/db/queries';
import type { WorkMode, WorkSession } from '@/db/types';
import { getWarningLevel, type WarningLevel } from '@/utils/compliance';
import {
  type DayBounds,
  type DaySegment,
  getDayBounds,
  getDaySegments,
  getWeekStart,
} from '@/utils/dayTimeline';
import {
  countExtensionsUsedThisWeek,
  getDailyDrivingStatus,
  getDrivingSinceLastBreak,
  sumModeTimeInRange,
} from '@/utils/workTime';
import {
  buildTimerAlerts,
  type CounterPercents,
  type TimerAlert,
} from '@/utils/workTimerAlerts';

const HOUR_MS = 60 * 60 * 1000;
const TWO_WEEKS_MS = 14 * 24 * HOUR_MS;
const TICK_INTERVAL_MS = 1_000;

export interface WorkTimerCounters {
  drivingSinceBreak: number;
  dailyDriving: number;
  weeklyDriving: number;
  biweeklyDriving: number;
}

export interface WorkTimerWarnings {
  drivingSinceBreak: WarningLevel | null;
  dailyDriving: WarningLevel | null;
  weeklyDriving: WarningLevel | null;
  biweeklyDriving: WarningLevel | null;
}

export interface UseWorkTimerReturn {
  currentMode: WorkMode | null;
  counters: WorkTimerCounters;
  warnings: WorkTimerWarnings;
  alerts: TimerAlert[];
  isBreakDueSoon: boolean;
  isLoading: boolean;
  todayBounds: DayBounds;
  todaySegments: DaySegment[];
  /**
   * The limit the daily counter is measured against. Stays at the regular 9h —
   * showing 10h up front would present the exception as the norm — and only
   * rises to 10h once driving has actually passed 9h on an available
   * extension, so the bar stops reading as a violation the driver isn't in.
   */
  dailyDrivingLimit: number;
  switchMode: (mode: WorkMode) => Promise<void>;
}

export function computeCounters(
  sessions: WorkSession[],
  now: number,
  lastDailyRestEnd: number | null,
  lastWeeklyRestEnd: number | null,
): WorkTimerCounters {
  // Without a recorded rest end the window must still be bounded: falling back
  // to 0 made the counter sum every driving session ever stored, so a fresh
  // install with any history reported impossible totals (e.g. 138h "today").
  // The calendar day/week is the natural floor — a real anchor, once a rest is
  // recorded, may legitimately sit earlier (driving through midnight).
  const dailyStart = lastDailyRestEnd ?? getDayBounds(now).dayStart;
  const weeklyStart = lastWeeklyRestEnd ?? getWeekStart(now);
  // EU art. 6(3): max 90h across two consecutive calendar weeks — the current
  // week plus the previous one. A rolling 14-day span would reach into a third
  // calendar week and overstate the total. Stepping back one millisecond from
  // this week's Monday lands in the previous week, whose start we then take.
  const biweeklyStart = getWeekStart(getWeekStart(now) - 1);

  return {
    drivingSinceBreak: getDrivingSinceLastBreak(sessions, now),
    dailyDriving: sumModeTimeInRange(sessions, 'driving', dailyStart, now),
    weeklyDriving: sumModeTimeInRange(sessions, 'driving', weeklyStart, now),
    biweeklyDriving: sumModeTimeInRange(
      sessions,
      'driving',
      biweeklyStart,
      now,
    ),
  };
}

function computeWarnings(
  counters: WorkTimerCounters,
  dailyLevel: WarningLevel | null,
): WorkTimerWarnings {
  return {
    drivingSinceBreak: getWarningLevel(
      counters.drivingSinceBreak,
      DRIVING_BEFORE_BREAK_MS,
    ),
    dailyDriving: dailyLevel,
    weeklyDriving: getWarningLevel(
      counters.weeklyDriving,
      MAX_WEEKLY_DRIVING_MS,
    ),
    biweeklyDriving: getWarningLevel(
      counters.biweeklyDriving,
      MAX_BIWEEKLY_DRIVING_MS,
    ),
  };
}

// Live percentage of each limit reached — recomputed on every tick, so an
// alert always shows the true value at that moment (e.g. 93%), not the
// nominal threshold that triggered it (drivers cross 75/90/100% between
// 30-second ticks, never exactly on the line).
function computePercents(counters: WorkTimerCounters): CounterPercents {
  return {
    drivingSinceBreak: Math.round(
      (counters.drivingSinceBreak / DRIVING_BEFORE_BREAK_MS) * 100,
    ),
    dailyDriving: Math.round(
      (counters.dailyDriving / MAX_DAILY_DRIVING_REGULAR_MS) * 100,
    ),
    weeklyDriving: Math.round(
      (counters.weeklyDriving / MAX_WEEKLY_DRIVING_MS) * 100,
    ),
    biweeklyDriving: Math.round(
      (counters.biweeklyDriving / MAX_BIWEEKLY_DRIVING_MS) * 100,
    ),
  };
}

export function useWorkTimer(): UseWorkTimerReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [currentMode, setCurrentMode] = useState<WorkMode | null>(null);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [lastDailyRestEnd, setLastDailyRestEnd] = useState<number | null>(null);
  const [lastWeeklyRestEnd, setLastWeeklyRestEnd] = useState<number | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    async function load() {
      const lookbackStart = Date.now() - TWO_WEEKS_MS;
      const [current, historical, settings] = await Promise.all([
        getCurrentWorkSession(),
        getWorkSessionsInRange(lookbackStart, Date.now()),
        getWorkTimerSettings(),
      ]);
      setCurrentMode(current?.mode ?? null);
      setSessions(historical);
      setLastDailyRestEnd(settings.lastDailyRestEnd);
      setLastWeeklyRestEnd(settings.lastWeeklyRestEnd);
      setIsLoading(false);
    }
    void load();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    // JS timers are throttled or paused while the app is backgrounded or the
    // screen is locked — the driver's real use case (phone on the dash). A
    // recompute on returning to foreground avoids showing a stale value until
    // the next tick fires.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(Date.now());
      }
    });
    return () => {
      clearInterval(id);
      subscription.remove();
    };
  }, []);

  const counters = useMemo(
    () => computeCounters(sessions, now, lastDailyRestEnd, lastWeeklyRestEnd),
    [sessions, now, lastDailyRestEnd, lastWeeklyRestEnd],
  );
  // The current daily period is what the driver is deciding about, so the
  // extensions already spent are counted from the periods that closed before it.
  const dailyStatus = useMemo(() => {
    const currentPeriodStart = lastDailyRestEnd ?? getDayBounds(now).dayStart;
    const used = countExtensionsUsedThisWeek(
      sessions,
      getWeekStart(now),
      currentPeriodStart,
      now,
    );
    return getDailyDrivingStatus(counters.dailyDriving, used);
  }, [sessions, counters.dailyDriving, lastDailyRestEnd, now]);

  const warnings = useMemo(
    () => computeWarnings(counters, dailyStatus.level),
    [counters, dailyStatus.level],
  );
  const percents = useMemo(() => computePercents(counters), [counters]);

  // While already on a break or rest, drivingSinceBreak is frozen (not yet
  // reset — see getDrivingSinceLastBreak) rather than accumulating, so the
  // pre-alert would otherwise fire for a break the driver is already taking.
  const isBreakDueSoon =
    currentMode !== 'break' &&
    currentMode !== 'rest' &&
    counters.drivingSinceBreak >=
      DRIVING_BEFORE_BREAK_MS - BREAK_PRE_ALERT_BEFORE_LIMIT_MS;

  const alerts = useMemo(
    () =>
      buildTimerAlerts(warnings, percents, isBreakDueSoon, currentMode, {
        inUse: dailyStatus.extensionInUse,
        used: dailyStatus.extensionsUsed,
      }),
    [warnings, percents, isBreakDueSoon, currentMode, dailyStatus],
  );

  const todayBounds = useMemo(() => getDayBounds(now), [now]);
  const todaySegments = useMemo(
    () => getDaySegments(sessions, todayBounds.dayStart, todayBounds.dayEnd, now),
    [sessions, todayBounds, now],
  );

  const switchMode = useCallback(
    async (mode: WorkMode) => {
      const newSession = await startWorkSession(mode);
      const closeTime = newSession.started_at;

      setCurrentMode(mode);
      setSessions((prev) => [
        ...prev.map((s) =>
          s.ended_at === null
            ? { ...s, ended_at: closeTime, updated_at: closeTime }
            : s,
        ),
        newSession,
      ]);
      setNow(Date.now());

      // startWorkSession may have updated app_settings if we just left a rest
      // period — reload so the counters anchor to the new rest end immediately.
      if (currentMode === 'rest') {
        const settings = await getWorkTimerSettings();
        setLastDailyRestEnd(settings.lastDailyRestEnd);
        setLastWeeklyRestEnd(settings.lastWeeklyRestEnd);
      }
    },
    [currentMode],
  );

  return {
    currentMode,
    counters,
    warnings,
    alerts,
    isBreakDueSoon,
    isLoading,
    todayBounds,
    todaySegments,
    dailyDrivingLimit: dailyStatus.limit,
    switchMode,
  };
}
