import { render, screen } from '@testing-library/react-native';

import { AlertBanner } from '@/components/AlertBanner';
import i18n from '@/i18n';
import type { TimerAlert } from '@/utils/workTimerAlerts';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function badgeGlyph(): string {
  const badge = screen.toJSON()?.children[0];
  const icon = badge && typeof badge !== 'string' ? badge.children[0] : null;
  const glyph = icon && typeof icon !== 'string' ? icon.children[0] : null;
  if (typeof glyph !== 'string') {
    throw new Error('AlertBanner rendered no badge icon');
  }
  return glyph;
}

describe('AlertBanner', () => {
  it('puts the live percentage into the message', async () => {
    const alert: TimerAlert = {
      id: 'drivingSinceBreak',
      severity: 'danger',
      messageKey: 'workTimer.warnings.drivingSinceBreak.danger',
      percent: 100,
    };
    await render(<AlertBanner alert={alert} />);
    expect(screen.getByText('Break limit reached (100%)')).toBeOnTheScreen();
  });

  it('reports how many extensions are spent instead of a percentage', async () => {
    const alert: TimerAlert = {
      id: 'dailyDriving',
      severity: 'warning',
      messageKey: 'workTimer.warnings.dailyDriving.extensionInUse',
      used: 1,
    };
    await render(<AlertBanner alert={alert} />);
    expect(
      screen.getByText('Past the basic limit — extension in use (1 of 2)'),
    ).toBeOnTheScreen();
  });

  it('leaves no unresolved placeholder in a message that takes no values', async () => {
    const alert: TimerAlert = {
      id: 'breakDueSoon',
      severity: 'warning',
      messageKey: 'workTimer.warnings.breakDueSoon',
    };
    await render(<AlertBanner alert={alert} />);
    expect(screen.getByText('30 min to the limit')).toBeOnTheScreen();
    expect(screen.queryByText(/\{\{/)).toBeNull();
  });

  it('announces the message itself, not the badge glyph', async () => {
    const alert: TimerAlert = {
      id: 'dailyDriving',
      severity: 'danger',
      messageKey: 'workTimer.warnings.dailyDriving.danger',
      percent: 100,
    };
    await render(<AlertBanner alert={alert} />);
    expect(screen.getByRole('alert').props.accessibilityLabel).toBe(
      'Daily driving limit reached (100%)',
    );
  });

  it.each(['info', 'warning', 'danger'] as const)(
    'carries the %s severity into both the surface and the message',
    async (severity) => {
      const alert: TimerAlert = {
        id: 'weeklyDriving',
        severity,
        messageKey: `workTimer.warnings.weeklyDriving.${severity}`,
        percent: 80,
      };
      await render(<AlertBanner alert={alert} />);
      expect(screen.getByRole('alert').props.className).toContain(
        `bg-${severity}-surface`,
      );
      expect(screen.getByText(/weekly/i).props.className).toContain(
        `text-${severity}-ink`,
      );
    },
  );

  it('gives every severity its own icon', async () => {
    const glyphs: string[] = [];
    for (const severity of ['info', 'warning', 'danger'] as const) {
      const view = await render(
        <AlertBanner
          alert={{
            id: 'weeklyDriving',
            severity,
            messageKey: `workTimer.warnings.weeklyDriving.${severity}`,
            percent: 80,
          }}
        />,
      );
      glyphs.push(badgeGlyph());
      await view.unmount();
    }
    expect(new Set(glyphs).size).toBe(3);
  });
});
