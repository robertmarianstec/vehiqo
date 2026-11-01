import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { GlobalPinnedHeader } from '@/components/GlobalPinnedHeader';
import {
  getCurrentWorkSession,
  getWorkSessionsInRange,
  getWorkTimerSettings,
  startWorkSession,
} from '@/db/queries';
import type { WorkMode, WorkSession } from '@/db/types';
import { WorkTimerProvider } from '@/hooks/WorkTimerProvider';
import i18n from '@/i18n';

import TimerScreen from '../../../app/(tabs)/index';

jest.mock('expo-router', () => ({
  usePathname: () => '/',
  Link: ({ children }: PropsWithChildren) => children,
}));

jest.mock('@/db/queries', () => ({
  getCurrentWorkSession: jest.fn(),
  getWorkSessionsInRange: jest.fn(),
  getWorkTimerSettings: jest.fn(),
  startWorkSession: jest.fn(),
}));

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = new Date(2026, 5, 17, 12).getTime();

function openSession(mode: WorkMode, startedAt: number): WorkSession {
  return {
    id: `${mode}-${startedAt}`,
    mode,
    started_at: startedAt,
    ended_at: null,
    created_at: startedAt,
    updated_at: startedAt,
    synced_at: null,
  };
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  const driving = openSession('driving', NOW - 4 * HOUR);
  jest.mocked(getCurrentWorkSession).mockResolvedValue(driving);
  jest.mocked(getWorkSessionsInRange).mockResolvedValue([driving]);
  jest.mocked(getWorkTimerSettings).mockResolvedValue({
    lastDailyRestEnd: null,
    lastWeeklyRestEnd: null,
  });
  jest
    .mocked(startWorkSession)
    .mockImplementation(async (mode) => openSession(mode, Date.now()));
  await i18n.changeLanguage('pl');
});

afterEach(() => {
  jest.useRealTimers();
});

async function renderTimer() {
  await render(
    <WorkTimerProvider>
      <GlobalPinnedHeader />
      <TimerScreen />
    </WorkTimerProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Ładowanie...')).toBeNull());
}

describe('work timer recovery', () => {
  it.each(['missing', 'stale'] as const)(
    'uses the same daily period for the counter and extensions with %s rest metadata',
    async (metadata) => {
      const firstRestStart = new Date(2026, 5, 15).getTime();
      const firstRestEnd = firstRestStart + 9 * HOUR;
      const nextRestStart = firstRestEnd + 10 * HOUR;
      const nextRestEnd = nextRestStart + 9 * HOUR;
      const dayStart = new Date(2026, 5, 16, 12, 45).getTime();
      const breakStart = dayStart + 8 * HOUR;
      const finalStart = new Date(2026, 5, 16, 23).getTime();
      jest.setSystemTime(finalStart + 90 * MINUTE);
      const closed = (
        mode: WorkMode,
        start: number,
        end: number,
      ): WorkSession => ({ ...openSession(mode, start), ended_at: end });
      const current = openSession('driving', finalStart);
      jest.mocked(getCurrentWorkSession).mockResolvedValue(current);
      jest
        .mocked(getWorkSessionsInRange)
        .mockResolvedValue([
          closed('rest', firstRestStart, firstRestEnd),
          closed('driving', firstRestEnd, nextRestStart),
          closed('rest', nextRestStart, nextRestEnd),
          closed('driving', dayStart, breakStart),
          closed('break', breakStart, breakStart + 45 * MINUTE),
          closed('other_work', breakStart + 45 * MINUTE, finalStart),
          current,
        ]);
      jest.mocked(getWorkTimerSettings).mockResolvedValue({
        lastDailyRestEnd: metadata === 'missing' ? null : firstRestEnd,
        lastWeeklyRestEnd: null,
      });
      await renderTimer();

      expect(screen.getByText('09:30')).toBeOnTheScreen();
      expect(screen.getByText('01:30')).toBeOnTheScreen();
      expect(screen.getAllByText('19:30')).toHaveLength(2);
      expect(screen.getByText('/ 10:00')).toBeOnTheScreen();
      expect(screen.getByRole('alert').props.accessibilityLabel).toBe(
        i18n.t('workTimer.warnings.dailyDriving.extensionInUse', { used: 2 }),
      );
    },
  );

  it('keeps earlier driving in the same week after a weekly rest', async () => {
    const mondayStart = new Date(2026, 5, 15, 8).getTime();
    const sundayStart = new Date(2026, 5, 14, 8).getTime();
    const restStart = new Date(2026, 5, 16, 8).getTime();
    const restEnd = NOW - 4 * HOUR;
    const current = openSession('driving', restEnd);
    jest.mocked(getWorkSessionsInRange).mockResolvedValue([
      {
        ...openSession('driving', sundayStart),
        ended_at: sundayStart + 5 * HOUR,
      },
      {
        ...openSession('driving', mondayStart),
        ended_at: mondayStart + 8 * HOUR,
      },
      { ...openSession('rest', restStart), ended_at: restEnd },
      current,
    ]);
    jest.mocked(getWorkTimerSettings).mockResolvedValue({
      lastDailyRestEnd: restEnd,
      lastWeeklyRestEnd: restEnd,
    });

    await renderTimer();

    expect(screen.getByText('12:00')).toBeOnTheScreen();
    expect(screen.getByText('17:00')).toBeOnTheScreen();
    expect(screen.getAllByText('04:00')).toHaveLength(2);
  });

  it('starts a new weekly total at midnight while the screen stays open', async () => {
    const monday = new Date(2026, 5, 15).getTime();
    jest.setSystemTime(monday - 1_000);
    const restEnd = new Date(2026, 5, 14, 20).getTime();
    const rest = {
      ...openSession('rest', restEnd - 24 * HOUR),
      ended_at: restEnd,
    };
    const current = openSession('driving', monday - 2 * HOUR);
    jest.mocked(getCurrentWorkSession).mockResolvedValue(current);
    jest.mocked(getWorkSessionsInRange).mockResolvedValue([rest, current]);
    jest.mocked(getWorkTimerSettings).mockResolvedValue({
      lastDailyRestEnd: restEnd,
      lastWeeklyRestEnd: restEnd,
    });
    await renderTimer();
    expect(screen.getAllByText('01:59')).toHaveLength(4);

    await act(() => jest.advanceTimersByTime(1_000));
    expect(screen.getByText('00:00')).toBeOnTheScreen();
    expect(screen.getAllByText('02:00')).toHaveLength(3);

    await act(() => jest.advanceTimersByTime(MINUTE));
    expect(screen.getByText('00:01')).toBeOnTheScreen();
    expect(screen.getAllByText('02:01')).toHaveLength(3);
  });

  it('adapts to the space left for details without changing counter values or mode controls', async () => {
    await renderTimer();
    const label = () => screen.getByText(i18n.t('workTimer.counters.daily'));
    const resizeDetails = async (height: number) =>
      fireEvent(screen.getByTestId('timer-details'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 360, height } },
      });

    expect(label().props.className).toContain('text-sm');
    await resizeDetails(64);
    expect(label().props.className).toContain('text-xs');
    expect(screen.getAllByText('04:00')).toHaveLength(4);
    expect(screen.getAllByRole('button')).toHaveLength(5);

    await resizeDetails(400);
    expect(label().props.className).toContain('text-sm');
    expect(screen.getAllByText('04:00')).toHaveLength(4);
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('keeps the displayed driving total and restores the warning after a short rest', async () => {
    await renderTimer();

    await fireEvent.press(screen.getByText('Odpoczynek'));
    expect(screen.getAllByText('04:00')).toHaveLength(4);
    expect(screen.queryByRole('alert')).toBeNull();

    await act(() => jest.advanceTimersByTime(MINUTE));
    await fireEvent.press(screen.getByText('Jazda'));

    expect(screen.getAllByText('04:00')).toHaveLength(4);
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.getByText('30 min do limitu')).toBeOnTheScreen();
    expect(screen.getByText('Do limitu: 00:30')).toBeOnTheScreen();
  });

  it('resets the displayed stint at 45 minutes without resetting the other totals', async () => {
    await renderTimer();
    await fireEvent.press(screen.getByText('Odpoczynek'));

    await act(() => jest.advanceTimersByTime(45 * MINUTE - 1_000));
    expect(screen.getAllByText('04:00')).toHaveLength(4);

    await act(() => jest.advanceTimersByTime(1_000));
    expect(screen.getByText('00:00')).toBeOnTheScreen();
    expect(screen.getAllByText('04:00')).toHaveLength(3);
    expect(screen.getByText('Do limitu: 04:30')).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).toBeNull();

    await fireEvent.press(screen.getByText('Jazda'));
    await act(() => jest.advanceTimersByTime(MINUTE));
    expect(screen.getByText('00:01')).toBeOnTheScreen();
    expect(screen.getAllByText('04:01')).toHaveLength(3);
  });
});
