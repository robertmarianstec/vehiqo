import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { getWorkSessionsInRange } from '@/db/queries';
import type { WorkMode, WorkSession } from '@/db/types';
import i18n from '@/i18n';

import ReportsScreen from '../../../app/reports';

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(effect, [effect]),
  };
});
jest.mock('@/db/queries', () => ({ getWorkSessionsInRange: jest.fn() }));

const HOUR = 3_600_000;
const NOW = new Date(2026, 5, 17, 12).getTime();
const MONDAY = new Date(2026, 5, 15).getTime();
function session(
  mode: WorkMode,
  start: number,
  end: number | null,
): WorkSession {
  return {
    id: `${mode}-${start}`,
    mode,
    started_at: start,
    ended_at: end,
    created_at: start,
    updated_at: end ?? start,
    synced_at: null,
  };
}
const history = [
  session('rest', MONDAY - 3 * HOUR, MONDAY + 6 * HOUR),
  session('other_work', MONDAY + 9 * HOUR, MONDAY + 10 * HOUR),
  session('standby', MONDAY + 31 * HOUR, MONDAY + 31.5 * HOUR),
  session('break', MONDAY + 35 * HOUR, MONDAY + 35.75 * HOUR),
  session('driving', NOW - 2 * HOUR, null),
];

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.mocked(getWorkSessionsInRange).mockReset().mockResolvedValue(history);
  await i18n.changeLanguage('pl');
});
afterEach(() => jest.useRealTimers());

async function loaded() {
  await render(<ReportsScreen />);
  await waitFor(() => expect(screen.queryByText('Ładowanie...')).toBeNull());
}

it('shows all five totals, missing time and expandable daily details', async () => {
  await loaded();
  for (const value of ['01:00', '00:30', '00:45', '06:00', '49:45'])
    expect(screen.getByText(value)).toBeOnTheScreen();
  const label = new Intl.DateTimeFormat('pl', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(NOW);
  await fireEvent.press(screen.getByRole('button', { name: label }));
  expect(
    screen.getByRole('button', { name: label, expanded: true }),
  ).toBeOnTheScreen();
  expect(screen.getByText('10:00')).toBeOnTheScreen();
  expect(screen.getByText('Dane do 12:00')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: label }));
  expect(screen.queryByText('Dane do 12:00')).toBeNull();
});

it('switches weeks and months, and prevents navigating into the future', async () => {
  await loaded();
  expect(screen.getByRole('button', { name: 'Następny okres' })).toBeDisabled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Poprzedni okres' }),
  );
  await waitFor(() =>
    expect(getWorkSessionsInRange).toHaveBeenLastCalledWith(
      new Date(2026, 5, 8).getTime(),
      MONDAY,
    ),
  );
  expect(screen.getByRole('button', { name: 'Następny okres' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Następny okres' }));
  await waitFor(() => expect(screen.getByText('49:45')).toBeOnTheScreen());
  await fireEvent.press(screen.getByRole('button', { name: 'Miesiąc' }));
  await waitFor(() =>
    expect(getWorkSessionsInRange).toHaveBeenLastCalledWith(
      new Date(2026, 5, 1).getTime(),
      NOW,
    ),
  );
  expect(
    screen.getByRole('button', { name: 'Miesiąc', selected: true }),
  ).toBeOnTheScreen();
  expect(screen.getByText('09:00')).toBeOnTheScreen();
});

it('shows the empty state instead of interpreting absent records as rest', async () => {
  jest.mocked(getWorkSessionsInRange).mockResolvedValue([]);
  await loaded();
  expect(screen.getByText('Brak zapisanego czasu')).toBeOnTheScreen();
  expect(screen.queryByText('Suma w wybranym okresie')).toBeNull();
});

it('supports retry after a database error', async () => {
  jest
    .mocked(getWorkSessionsInRange)
    .mockRejectedValueOnce(new Error('read failed'));
  await loaded();
  expect(screen.getByRole('alert')).toHaveTextContent(
    i18n.t('reports.loadError'),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Spróbuj ponownie' }),
  );
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(screen.getByText('49:45')).toBeOnTheScreen();
});

it('does not replace a newer selection with a late read for the old period', async () => {
  let finishOldRead!: (value: WorkSession[]) => void;
  jest.mocked(getWorkSessionsInRange).mockReturnValueOnce(
    new Promise((resolve) => {
      finishOldRead = resolve;
    }),
  );
  await render(<ReportsScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Miesiąc' }));
  await waitFor(() => expect(screen.queryByText('Ładowanie...')).toBeNull());
  expect(screen.getByText('09:00')).toBeOnTheScreen();
  await act(() => finishOldRead([]));
  expect(screen.getByText('09:00')).toBeOnTheScreen();
  expect(screen.queryByText('Brak zapisanego czasu')).toBeNull();
});

it('refreshes the report snapshot and the ongoing driving total on pull to refresh', async () => {
  await loaded();
  jest.setSystemTime(NOW + HOUR);
  await fireEvent(screen.getByTestId('report-days'), 'refresh');
  await waitFor(() => expect(screen.getAllByText('03:00')).toHaveLength(2));
});

it('refuses to show totals from overlapping records', async () => {
  jest
    .mocked(getWorkSessionsInRange)
    .mockResolvedValue([
      session('driving', NOW - HOUR, null),
      session('rest', NOW - HOUR, null),
    ]);
  await loaded();
  expect(screen.getByRole('alert')).toBeOnTheScreen();
  expect(screen.queryByText('Suma w wybranym okresie')).toBeNull();
});

it('updates the snapshot after the app returns from the background', async () => {
  const listener = jest.mocked(AppState.addEventListener);
  const original = listener.getMockImplementation();
  let onChange: ((state: AppStateStatus) => void) | undefined;
  listener.mockImplementation((_event, callback) => {
    onChange = callback;
    return { remove: jest.fn() };
  });
  try {
    await loaded();
    jest.setSystemTime(NOW + HOUR);
    await act(() => onChange?.('active'));
    await waitFor(() => expect(screen.getAllByText('03:00')).toHaveLength(2));
  } finally {
    if (original) listener.mockImplementation(original);
  }
});
