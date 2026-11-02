import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import {
  BREAK_PRE_ALERT_BEFORE_LIMIT_MS,
  DRIVING_BEFORE_BREAK_MS,
  MAX_BIWEEKLY_DRIVING_MS,
  MAX_DAILY_DRIVING_EXTENDED_MS,
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
import { assertValidWorkSessions } from '@/utils/workSessionValidation';
import {
  countExtensionsUsedThisWeek,
  getCurrentDailyDrivingStart,
  getDailyDrivingStatus,
  getDrivingSinceLastBreak,
  sumModeTimeInRange,
} from '@/utils/workTime';
import {
  buildTimerAlerts,
  type CounterPercents,
  type TimerAlert,
} from '@/utils/workTimerAlerts';
import {
  hasContinuousCoverage,
  hasKnownExtensionHistory,
} from '@/utils/workTimerCoverage';

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
  loadError: boolean;
  retryLoad: () => void;
  todayBounds: DayBounds;
  todaySegments: DaySegment[];
  dailyDrivingComplete: boolean;
  dailyExtensionsKnown: boolean;
  /**
   * The limit the daily counter is measured against. Stays at the regular 9h —
   * showing 10h up front would present the exception as the norm — and only
   * rises to 10h once driving has actually passed 9h on an available
   * extension, so the bar stops reading as a violation the driver isn't in.
   */
  dailyDrivingLimit: number | null;
  switchMode: (mode: WorkMode) => Promise<void>;
}

export function computeCounters(
  sessions: WorkSession[],
  now: number,
  lastDailyRestEnd: number | null,
): WorkTimerCounters {
  const dailyStart =
    getCurrentDailyDrivingStart(sessions, now, lastDailyRestEnd) ??
    sessions.reduce(
      (start, session) => Math.min(start, session.started_at),
      now,
    );
  // EU 561/2006 art. 4(i), 6(2): weekly rest does not reset a calendar week.
  const weeklyStart = getWeekStart(now);
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
function computePercents(
  counters: WorkTimerCounters,
  dailyLimit: number | null,
): CounterPercents {
  return {
    drivingSinceBreak: Math.round(
      (counters.drivingSinceBreak / DRIVING_BEFORE_BREAK_MS) * 100,
    ),
    dailyDriving:
      dailyLimit === null
        ? 0
        : Math.round((counters.dailyDriving / dailyLimit) * 100),
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
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [currentMode, setCurrentMode] = useState<WorkMode | null>(null);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [lastDailyRestEnd, setLastDailyRestEnd] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError(false);
      try {
        const settings = await getWorkTimerSettings();
        const loadTime = Date.now();
        // The autumn clock change can make two calendar weeks exceed 14x24h.
        const lookbackStart = Math.min(
          loadTime - TWO_WEEKS_MS,
          getWeekStart(getWeekStart(loadTime) - 1),
          settings.lastDailyRestEnd ?? 0,
        );
        const [current, historical] = await Promise.all([
          getCurrentWorkSession(),
          getWorkSessionsInRange(lookbackStart, loadTime),
        ]);
        if (cancelled) return;
        const loaded =
          current && !historical.some((session) => session.id === current.id)
            ? [...historical, current]
            : historical;
        assertValidWorkSessions(loaded);
        setCurrentMode(current?.mode ?? null);
        setSessions(loaded);
        setLastDailyRestEnd(settings.lastDailyRestEnd);
        setNow(Date.now());
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const retryLoad = useCallback(
    () => setLoadAttempt((attempt) => attempt + 1),
    [],
  );

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
    () => computeCounters(sessions, now, lastDailyRestEnd),
    [sessions, now, lastDailyRestEnd],
  );
  const clockInvalid =
    (lastDailyRestEnd !== null && lastDailyRestEnd > now) ||
    sessions.some(
      (session) =>
        session.started_at > now ||
        (session.ended_at !== null && session.ended_at > now),
    );
  const currentPeriodStart = useMemo(
    () => getCurrentDailyDrivingStart(sessions, now, lastDailyRestEnd),
    [sessions, now, lastDailyRestEnd],
  );
  const dailyDrivingComplete =
    currentPeriodStart !== null &&
    hasContinuousCoverage(sessions, currentPeriodStart, now);
  const dailyExtensionsKnown = hasKnownExtensionHistory(
    sessions,
    getWeekStart(now),
    currentPeriodStart,
    now,
  );
  // The current daily period is what the driver is deciding about, so the
  // extensions already spent are counted from the periods that closed before it.
  const dailyStatus = useMemo(() => {
    if (
      !dailyDrivingComplete ||
      !dailyExtensionsKnown ||
      currentPeriodStart === null
    )
      return null;
    const used = countExtensionsUsedThisWeek(
      sessions,
      getWeekStart(now),
      currentPeriodStart,
      now,
    );
    return getDailyDrivingStatus(counters.dailyDriving, used);
  }, [
    sessions,
    counters.dailyDriving,
    dailyDrivingComplete,
    dailyExtensionsKnown,
    currentPeriodStart,
    now,
  ]);

  const dailyLimit = dailyStatus?.limit ?? null;
  const dailyLevel = dailyDrivingComplete
    ? (dailyStatus?.level ??
      (counters.dailyDriving >= MAX_DAILY_DRIVING_EXTENDED_MS
        ? 'danger'
        : null))
    : null;

  const warnings = useMemo(
    () => computeWarnings(counters, dailyLevel),
    [counters, dailyLevel],
  );
  const percents = useMemo(
    () => computePercents(counters, dailyLimit),
    [counters, dailyLimit],
  );

  // While already on a break or rest, drivingSinceBreak is frozen (not yet
  // reset — see getDrivingSinceLastBreak) rather than accumulating, so the
  // pre-alert would otherwise fire for a break the driver is already taking.
  const isBreakDueSoon =
    currentMode !== 'break' &&
    currentMode !== 'rest' &&
    counters.drivingSinceBreak < DRIVING_BEFORE_BREAK_MS &&
    counters.drivingSinceBreak >=
      DRIVING_BEFORE_BREAK_MS - BREAK_PRE_ALERT_BEFORE_LIMIT_MS;

  const alerts = useMemo(
    () =>
      loadError || clockInvalid
        ? []
        : buildTimerAlerts(
            warnings,
            percents,
            isBreakDueSoon
              ? DRIVING_BEFORE_BREAK_MS - counters.drivingSinceBreak
              : null,
            currentMode,
            {
              inUse: dailyStatus?.extensionInUse ?? false,
              used: dailyStatus?.extensionsUsed ?? 0,
              historyKnown: dailyExtensionsKnown,
            },
          ),
    [
      warnings,
      percents,
      isBreakDueSoon,
      currentMode,
      dailyStatus,
      counters.drivingSinceBreak,
      dailyExtensionsKnown,
      loadError,
      clockInvalid,
    ],
  );

  const todayBounds = useMemo(() => getDayBounds(now), [now]);
  const todaySegments = useMemo(
    () =>
      getDaySegments(sessions, todayBounds.dayStart, todayBounds.dayEnd, now),
    [sessions, todayBounds, now],
  );

  const switchMode = useCallback(async (mode: WorkMode) => {
    const newSession = await startWorkSession(mode);
    const closeTime = newSession.started_at;

    setCurrentMode(newSession.mode);
    // The closed rest in session history supplies the new daily boundary.
    setSessions((prev) =>
      prev.some((session) => session.id === newSession.id)
        ? prev
        : [
            ...prev.map((s) =>
              s.ended_at === null
                ? { ...s, ended_at: closeTime, updated_at: closeTime }
                : s,
            ),
            newSession,
          ],
    );
    setNow(Date.now());
  }, []);

  return {
    currentMode,
    counters,
    warnings,
    alerts,
    isBreakDueSoon,
    isLoading,
    loadError: loadError || clockInvalid,
    retryLoad,
    todayBounds,
    todaySegments,
    dailyDrivingComplete,
    dailyExtensionsKnown,
    dailyDrivingLimit: dailyLimit,
    switchMode,
  };
}
