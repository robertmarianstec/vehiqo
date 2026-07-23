import {
  buildTimerAlerts,
  type CounterPercents,
  type CounterWarnings,
} from '@/utils/workTimerAlerts';

const NO_WARNINGS: CounterWarnings = {
  drivingSinceBreak: null,
  dailyDriving: null,
  weeklyDriving: null,
  biweeklyDriving: null,
};

const NO_PERCENTS: CounterPercents = {
  drivingSinceBreak: 0,
  dailyDriving: 0,
  weeklyDriving: 0,
  biweeklyDriving: 0,
};

describe('buildTimerAlerts', () => {
  it('returns no alerts when nothing is triggered', () => {
    expect(buildTimerAlerts(NO_WARNINGS, NO_PERCENTS, false, null)).toEqual(
      [],
    );
  });

  it('builds a counter alert with matching severity, message key and live percent', () => {
    const alerts = buildTimerAlerts(
      { ...NO_WARNINGS, dailyDriving: 'info' },
      { ...NO_PERCENTS, dailyDriving: 77 },
      false,
      null,
    );
    expect(alerts).toEqual([
      {
        id: 'dailyDriving',
        severity: 'info',
        messageKey: 'workTimer.warnings.dailyDriving.info',
        percent: 77,
      },
    ]);
  });

  it('carries the correct percent per counter, not a shared value', () => {
    const alerts = buildTimerAlerts(
      { ...NO_WARNINGS, dailyDriving: 'warning', weeklyDriving: 'danger' },
      { ...NO_PERCENTS, dailyDriving: 93, weeklyDriving: 104 },
      false,
      null,
    );
    const byId = Object.fromEntries(alerts.map((a) => [a.id, a.percent]));
    expect(byId.dailyDriving).toBe(93);
    expect(byId.weeklyDriving).toBe(104);
  });

  it('orders alerts most severe first', () => {
    const alerts = buildTimerAlerts(
      {
        drivingSinceBreak: 'info',
        dailyDriving: 'danger',
        weeklyDriving: 'warning',
        biweeklyDriving: null,
      },
      NO_PERCENTS,
      false,
      null,
    );
    expect(alerts.map((a) => a.severity)).toEqual([
      'danger',
      'warning',
      'info',
    ]);
    expect(alerts.map((a) => a.id)).toEqual([
      'dailyDriving',
      'weeklyDriving',
      'drivingSinceBreak',
    ]);
  });

  it('adds the break-due-soon pre-alert as a warning with no percent', () => {
    const alerts = buildTimerAlerts(NO_WARNINGS, NO_PERCENTS, true, null);
    expect(alerts).toEqual([
      {
        id: 'breakDueSoon',
        severity: 'warning',
        messageKey: 'workTimer.warnings.breakDueSoon',
      },
    ]);
  });

  it('suppresses break-due-soon once driving-since-break reaches danger', () => {
    const alerts = buildTimerAlerts(
      { ...NO_WARNINGS, drivingSinceBreak: 'danger' },
      { ...NO_PERCENTS, drivingSinceBreak: 101 },
      true,
      null,
    );
    expect(alerts.map((a) => a.id)).toEqual(['drivingSinceBreak']);
    expect(alerts[0].severity).toBe('danger');
  });

  it('keeps break-due-soon ahead of a same-severity counter warning', () => {
    const alerts = buildTimerAlerts(
      { ...NO_WARNINGS, drivingSinceBreak: 'warning' },
      { ...NO_PERCENTS, drivingSinceBreak: 92 },
      true,
      null,
    );
    expect(alerts.map((a) => a.id)).toEqual([
      'breakDueSoon',
      'drivingSinceBreak',
    ]);
    expect(alerts.every((a) => a.severity === 'warning')).toBe(true);
  });

  it('suppresses the stale drivingSinceBreak counter alert while on break', () => {
    const alerts = buildTimerAlerts(
      { ...NO_WARNINGS, drivingSinceBreak: 'danger' },
      { ...NO_PERCENTS, drivingSinceBreak: 101 },
      false,
      'break',
    );
    expect(alerts).toEqual([]);
  });

  it('suppresses the stale drivingSinceBreak counter alert while on rest', () => {
    const alerts = buildTimerAlerts(
      { ...NO_WARNINGS, drivingSinceBreak: 'warning' },
      { ...NO_PERCENTS, drivingSinceBreak: 92 },
      false,
      'rest',
    );
    expect(alerts).toEqual([]);
  });

  it('still shows other counter alerts while on break', () => {
    const alerts = buildTimerAlerts(
      {
        ...NO_WARNINGS,
        drivingSinceBreak: 'danger',
        dailyDriving: 'warning',
      },
      { ...NO_PERCENTS, drivingSinceBreak: 101, dailyDriving: 93 },
      false,
      'break',
    );
    expect(alerts.map((a) => a.id)).toEqual(['dailyDriving']);
  });

  it('shows the drivingSinceBreak alert normally in other modes', () => {
    const alerts = buildTimerAlerts(
      { ...NO_WARNINGS, drivingSinceBreak: 'danger' },
      { ...NO_PERCENTS, drivingSinceBreak: 101 },
      false,
      'driving',
    );
    expect(alerts.map((a) => a.id)).toEqual(['drivingSinceBreak']);
  });
});
