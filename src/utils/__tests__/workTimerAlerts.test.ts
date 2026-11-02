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
  it.each([30, 10, 1])(
    'carries the actual %s remaining minutes in the pre-alert',
    (minutes) => {
      expect(
        buildTimerAlerts(NO_WARNINGS, NO_PERCENTS, minutes * 60_000, 'driving'),
      ).toEqual([
        {
          id: 'breakDueSoon',
          severity: 'warning',
          messageKey: 'workTimer.warnings.breakDueSoon',
          remainingMs: minutes * 60_000,
        },
      ]);
    },
  );

  it.each([31 * 60_000, 0, -1])(
    'does not emit a pre-alert for %s remaining milliseconds',
    (remaining) => {
      expect(
        buildTimerAlerts(NO_WARNINGS, NO_PERCENTS, remaining, 'driving'),
      ).toEqual([]);
    },
  );

  it.each(['break', 'rest'] as const)(
    'does not emit a pre-alert while already in %s mode',
    (mode) => {
      expect(
        buildTimerAlerts(NO_WARNINGS, NO_PERCENTS, 10 * 60_000, mode),
      ).toEqual([]);
    },
  );

  it('returns no alerts when nothing is triggered', () => {
    expect(buildTimerAlerts(NO_WARNINGS, NO_PERCENTS, null, null)).toEqual([]);
  });

  it('builds a counter alert with matching severity, message key and live percent', () => {
    const alerts = buildTimerAlerts(
      { ...NO_WARNINGS, dailyDriving: 'info' },
      { ...NO_PERCENTS, dailyDriving: 77 },
      null,
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
      null,
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
      null,
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
    const alerts = buildTimerAlerts(
      NO_WARNINGS,
      NO_PERCENTS,
      30 * 60_000,
      null,
    );
    expect(alerts).toEqual([
      {
        id: 'breakDueSoon',
        severity: 'warning',
        messageKey: 'workTimer.warnings.breakDueSoon',
        remainingMs: 30 * 60_000,
      },
    ]);
  });

  it('suppresses break-due-soon once driving-since-break reaches danger', () => {
    const alerts = buildTimerAlerts(
      { ...NO_WARNINGS, drivingSinceBreak: 'danger' },
      { ...NO_PERCENTS, drivingSinceBreak: 101 },
      30 * 60_000,
      null,
    );
    expect(alerts.map((a) => a.id)).toEqual(['drivingSinceBreak']);
    expect(alerts[0].severity).toBe('danger');
  });

  it('keeps break-due-soon ahead of a same-severity counter warning', () => {
    const alerts = buildTimerAlerts(
      { ...NO_WARNINGS, drivingSinceBreak: 'warning' },
      { ...NO_PERCENTS, drivingSinceBreak: 92 },
      30 * 60_000,
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
      null,
      'break',
    );
    expect(alerts).toEqual([]);
  });

  it('suppresses the stale drivingSinceBreak counter alert while on rest', () => {
    const alerts = buildTimerAlerts(
      { ...NO_WARNINGS, drivingSinceBreak: 'warning' },
      { ...NO_PERCENTS, drivingSinceBreak: 92 },
      null,
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
      null,
      'break',
    );
    expect(alerts.map((a) => a.id)).toEqual(['dailyDriving']);
  });

  it('shows the drivingSinceBreak alert normally in other modes', () => {
    const alerts = buildTimerAlerts(
      { ...NO_WARNINGS, drivingSinceBreak: 'danger' },
      { ...NO_PERCENTS, drivingSinceBreak: 101 },
      null,
      'driving',
    );
    expect(alerts.map((a) => a.id)).toEqual(['drivingSinceBreak']);
  });
});

describe('buildTimerAlerts — daily driving extension', () => {
  const noWarnings = {
    drivingSinceBreak: null,
    dailyDriving: null,
    weeklyDriving: null,
    biweeklyDriving: null,
  };
  const percents = {
    drivingSinceBreak: 0,
    dailyDriving: 105,
    weeklyDriving: 0,
    biweeklyDriving: 0,
  };

  it.each(['info', 'warning'] as const)(
    'suppresses a daily %s message when extension history is unknown',
    (level) => {
      expect(
        buildTimerAlerts(
          { ...noWarnings, dailyDriving: level, weeklyDriving: 'warning' },
          percents,
          null,
          'driving',
          { inUse: true, used: 1, historyKnown: false },
        ),
      ).toEqual([
        {
          id: 'weeklyDriving',
          severity: 'warning',
          messageKey: 'workTimer.warnings.weeklyDriving.warning',
          percent: 0,
        },
      ]);
    },
  );

  it.each([false, true])(
    'reports the known maximum without inferring extension usage from unknown history (inUse: %s)',
    (inUse) => {
      expect(
        buildTimerAlerts(
          { ...noWarnings, dailyDriving: 'danger' },
          percents,
          null,
          'driving',
          { inUse, used: 2, historyKnown: false },
        ),
      ).toEqual([
        {
          id: 'dailyDriving',
          severity: 'danger',
          messageKey:
            'workTimer.warnings.dailyDriving.maximumReachedUnknownHistory',
        },
      ]);
    },
  );

  it('reports an extension in use instead of the plain limit message', () => {
    const alerts = buildTimerAlerts(
      { ...noWarnings, dailyDriving: 'warning' },
      percents,
      null,
      'driving',
      { inUse: true, used: 1 },
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].messageKey).toBe(
      'workTimer.warnings.dailyDriving.extensionInUse',
    );
    expect(alerts[0].severity).toBe('warning');
    expect(alerts[0].used).toBe(1);
  });

  it('keeps the plain danger message when no extension is in use', () => {
    const alerts = buildTimerAlerts(
      { ...noWarnings, dailyDriving: 'danger' },
      percents,
      null,
      'driving',
      { inUse: false, used: 2 },
    );
    expect(alerts[0].messageKey).toBe('workTimer.warnings.dailyDriving.danger');
    expect(alerts[0].percent).toBe(105);
  });

  it('leaves the other counters untouched', () => {
    const alerts = buildTimerAlerts(
      { ...noWarnings, dailyDriving: 'warning', weeklyDriving: 'danger' },
      percents,
      null,
      'driving',
      { inUse: true, used: 2 },
    );
    expect(alerts.map((a) => a.id)).toEqual(['weeklyDriving', 'dailyDriving']);
  });
});
