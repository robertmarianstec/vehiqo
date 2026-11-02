import { BREAK_PRE_ALERT_BEFORE_LIMIT_MS } from '@/constants/euRegulations';
import type { WorkMode } from '@/db/types';
import type { WarningLevel } from '@/utils/compliance';

export type AlertSeverity = WarningLevel;

export interface CounterWarnings {
  drivingSinceBreak: WarningLevel | null;
  dailyDriving: WarningLevel | null;
  weeklyDriving: WarningLevel | null;
  biweeklyDriving: WarningLevel | null;
}

export interface CounterPercents {
  drivingSinceBreak: number;
  dailyDriving: number;
  weeklyDriving: number;
  biweeklyDriving: number;
}

type CounterAlertId = keyof CounterWarnings;

export type TimerAlertId = 'breakDueSoon' | CounterAlertId;

type MessageKey =
  | 'workTimer.warnings.breakDueSoon'
  | 'workTimer.warnings.dailyDriving.extensionInUse'
  | 'workTimer.warnings.dailyDriving.maximumReachedUnknownHistory'
  | `workTimer.warnings.${CounterAlertId}.${WarningLevel}`;

export interface TimerAlert {
  id: TimerAlertId;
  severity: AlertSeverity;
  messageKey: MessageKey;
  // Live percentage of the limit reached for the four counter-based alerts.
  percent?: number;
  remainingMs?: number;
  /** How many of the week's two 10h extensions are spent, including this one. */
  used?: number;
}

export interface DailyExtensionState {
  inUse: boolean;
  used: number;
  historyKnown?: boolean;
}

const COUNTER_ORDER: CounterAlertId[] = [
  'drivingSinceBreak',
  'dailyDriving',
  'weeklyDriving',
  'biweeklyDriving',
];

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  danger: 0,
  warning: 1,
  info: 2,
};

// At the break limit, the reached-limit message replaces the countdown.
export function buildTimerAlerts(
  warnings: CounterWarnings,
  percents: CounterPercents,
  breakRemainingMs: number | null,
  currentMode: WorkMode | null,
  dailyExtension: DailyExtensionState = { inUse: false, used: 0 },
): TimerAlert[] {
  const alerts: TimerAlert[] = [];
  // The counter stays frozen until the break/rest reaches its duration threshold.
  // Suppress its alerts during recovery rather than implying continued driving.
  const onQualifyingBreak = currentMode === 'break' || currentMode === 'rest';

  if (
    !onQualifyingBreak &&
    breakRemainingMs !== null &&
    breakRemainingMs > 0 &&
    breakRemainingMs <= BREAK_PRE_ALERT_BEFORE_LIMIT_MS &&
    warnings.drivingSinceBreak !== 'danger'
  ) {
    alerts.push({
      id: 'breakDueSoon',
      severity: 'warning',
      messageKey: 'workTimer.warnings.breakDueSoon',
      remainingMs: breakRemainingMs,
    });
  }

  for (const id of COUNTER_ORDER) {
    if (id === 'drivingSinceBreak' && onQualifyingBreak) continue;
    const level = warnings[id];
    if (level === null) continue;

    if (id === 'dailyDriving' && dailyExtension.historyKnown === false) {
      if (level === 'danger') {
        alerts.push({
          id,
          severity: level,
          messageKey:
            'workTimer.warnings.dailyDriving.maximumReachedUnknownHistory',
        });
      }
      continue;
    }

    // Between the basic and extended thresholds, report the extension in use.
    if (id === 'dailyDriving' && dailyExtension.inUse) {
      alerts.push({
        id,
        severity: level,
        messageKey: 'workTimer.warnings.dailyDriving.extensionInUse',
        used: dailyExtension.used,
      });
      continue;
    }

    alerts.push({
      id,
      severity: level,
      messageKey: `workTimer.warnings.${id}.${level}`,
      percent: percents[id],
    });
  }

  return alerts.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}
