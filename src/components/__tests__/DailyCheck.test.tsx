import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { getDatabase } from '@/db';
import { SCHEMA_SQL } from '@/db/schema';
import i18n from '@/i18n';
import { pickDailyCheckPhoto } from '@/services/dailyCheckPhotos';
import { createTestDatabase } from '@/test/sqlite';

import DailyCheckScreen from '../../../app/(tabs)/daily-check';

jest.mock('@/db', () => ({
  getDatabase: jest.fn(),
  WebDatabaseUnavailableError: class extends Error {},
}));
jest.mock('@/utils/id', () => {
  let id = 0;
  return { generateId: () => `ui-check-${++id}` };
});
jest.mock('@/services/dailyCheckPhotos', () => ({
  discardDailyCheckPhoto: jest.fn(),
  pickDailyCheckPhoto: jest.fn(),
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
let database: ReturnType<typeof createTestDatabase>;
beforeEach(async () => {
  jest.clearAllMocks();
  database = createTestDatabase(SCHEMA_SQL);
  jest.mocked(getDatabase).mockResolvedValue(database.adapter);
  jest.mocked(pickDailyCheckPhoto).mockResolvedValue(null);
  await i18n.changeLanguage('pl');
});
afterEach(() => {
  database.sqlite.close();
});
async function loaded() {
  await render(<DailyCheckScreen />);
  await waitFor(() => expect(screen.queryByText('Ładowanie...')).toBeNull());
}
async function settled() {
  await waitFor(() =>
    expect(screen.queryByText('Zapisywanie zmian…')).toBeNull(),
  );
}

it('shows the unseeded checklist, lists missing points, and returns without completing it', async () => {
  await loaded();
  expect(screen.getByText('0 z 7 sprawdzonych')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Podsumowanie'));
  await waitFor(() =>
    expect(screen.getByText('Pozostało do sprawdzenia: 7')).toBeOnTheScreen(),
  );
  await fireEvent.press(screen.getByText('Wróć do brakujących punktów'));
  await waitFor(() =>
    expect(screen.getByText('Przegląd dzienny')).toBeOnTheScreen(),
  );
  expect(
    database.sqlite.prepare('SELECT completed_at FROM daily_checks').get(),
  ).toEqual({ completed_at: null });
});

it('saves note/defect changes, requires confirmation, and shows the actual saved driver', async () => {
  await loaded();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Uwagi: Koła i opony' }),
  );
  await fireEvent.changeText(
    screen.getByLabelText('Notatka (opcjonalnie)'),
    'Uszkodzenie opony',
  );
  await settled();
  await fireEvent.press(
    screen.getByRole('checkbox', { name: 'Zgłaszam usterkę' }),
  );
  await settled();
  await fireEvent.press(
    screen.getByRole('checkbox', { name: 'Oznaczam jako krytyczną' }),
  );
  await settled();
  for (const item of [
    'Koła i opony',
    'Światła',
    'Lusterka i szyby',
    'Hamulce',
    'Poziomy płynów',
    'Połączenie z naczepą',
    'Dokumenty w kabinie',
  ]) {
    await fireEvent.press(
      screen.getByRole('checkbox', { name: `${item} — sprawdzono` }),
    );
    await settled();
  }
  await fireEvent.press(screen.getByText('Podsumowanie'));
  await waitFor(() =>
    expect(screen.getByText('Potwierdzenie kierowcy')).toBeOnTheScreen(),
  );
  await fireEvent.press(screen.getByText('Zapisz przegląd'));
  expect(screen.getByText('Wpisz imię kierowcy.')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Imię kierowcy'), 'Jan');
  await fireEvent.press(screen.getByText('Zapisz przegląd'));
  expect(
    screen.getByText('Zaznacz potwierdzenie wykonania kontroli.'),
  ).toBeOnTheScreen();
  await fireEvent.press(
    screen.getByRole('checkbox', {
      name: 'Potwierdzam wykonanie zaznaczonych kontroli.',
    }),
  );
  await fireEvent.press(screen.getByText('Zapisz przegląd'));
  await waitFor(() =>
    expect(screen.getByText('Przegląd zapisany')).toBeOnTheScreen(),
  );
  expect(screen.getByText('Jan')).toBeOnTheScreen();
  expect(screen.getByText('Uszkodzenie opony')).toBeOnTheScreen();
  expect(
    screen.getByText(/Usterka krytyczna pozostaje oznaczona/),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Przejdź do naczepy'));
  await waitFor(() =>
    expect(screen.getByText('0 z 6 sprawdzonych')).toBeOnTheScreen(),
  );
});

it('changes trailer labels without losing the tractor draft and keeps photos optional', async () => {
  await loaded();
  await fireEvent.press(
    screen.getByRole('checkbox', { name: 'Koła i opony — sprawdzono' }),
  );
  await settled();
  await fireEvent.press(screen.getByRole('button', { name: 'Naczepa' }));
  await waitFor(() =>
    expect(screen.getByText('Typ naczepy')).toBeOnTheScreen(),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Typ naczepy' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Chłodnia' }));
  await waitFor(() =>
    expect(screen.getByText('Zabudowa i agregat')).toBeOnTheScreen(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Uwagi: Koła i opony' }),
  );
  await fireEvent.press(screen.getByText('Dodaj zdjęcie (opcjonalnie)'));
  await waitFor(() => expect(pickDailyCheckPhoto).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Ciągnik' })).not.toBeDisabled(),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Ciągnik' }));
  await waitFor(() =>
    expect(screen.getByText('1 z 7 sprawdzonych')).toBeOnTheScreen(),
  );
});

it('shows an actionable read error and recovers without a fake saved record', async () => {
  jest.mocked(getDatabase).mockRejectedValue(new Error('cannot open'));
  await loaded();
  expect(
    screen.getByText('Nie udało się odczytać przeglądu. Spróbuj ponownie.'),
  ).toBeOnTheScreen();
  expect(screen.queryByText('Przegląd zapisany')).toBeNull();
  jest.mocked(getDatabase).mockResolvedValue(database.adapter);
  await fireEvent.press(screen.getByText('Spróbuj ponownie'));
  await waitFor(() =>
    expect(screen.getByText('0 z 7 sprawdzonych')).toBeOnTheScreen(),
  );
});
