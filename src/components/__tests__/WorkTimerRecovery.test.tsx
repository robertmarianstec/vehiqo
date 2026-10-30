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
  expect(screen.getAllByText('04:00')).toHaveLength(4);
}

describe('work timer recovery', () => {
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
