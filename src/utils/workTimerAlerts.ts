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
  | `workTimer.warnings.${CounterAlertId}.${WarningLevel}`;

export interface TimerAlert {
  id: TimerAlertId;
  severity: AlertSeverity;
  messageKey: MessageKey;
  // Live percentage of the limit reached, shown in the message for the four
  // counter-based alerts. breakDueSoon has no percent — it's a fixed 30-minute
  // pre-alert, not a threshold-based one.
  percent?: number;
  /** How many of the week's two 10h extensions are spent, including this one. */
  used?: number;
}

export interface DailyExtensionState {
  inUse: boolean;
  used: number;
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

// The "break due soon" pre-alert is dropped once driving-since-break hits the
// 100% level: the break is no longer "soon" but mandatory now, so the danger
// message for that counter replaces it instead of showing both.
export function buildTimerAlerts(
  warnings: CounterWarnings,
  percents: CounterPercents,
  isBreakDueSoon: boolean,
  currentMode: WorkMode | null,
  dailyExtension: DailyExtensionState = { inUse: false, used: 0 },
): TimerAlert[] {
  const alerts: TimerAlert[] = [];
  // A driver already on a break or rest is actively complying with the
  // driving-since-break limit. That counter only resets once the break/rest
  // qualifies (see getDrivingSinceLastBreak) — before then it stays frozen at
  // its pre-break value, which would otherwise read as "take a break soon"
  // while the driver is already taking one.
  const onQualifyingBreak = currentMode === 'break' || currentMode === 'rest';

  if (isBreakDueSoon && warnings.drivingSinceBreak !== 'danger') {
    alerts.push({
      id: 'breakDueSoon',
      severity: 'warning',
      messageKey: 'workTimer.warnings.breakDueSoon',
    });
  }

  for (const id of COUNTER_ORDER) {
    if (id === 'drivingSinceBreak' && onQualifyingBreak) continue;
    const level = warnings[id];
    if (level === null) continue;

    // Past 9h on an extension the driver still had, the plain "limit reached"
    // wording would misstate a legal drive as a violation.
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
