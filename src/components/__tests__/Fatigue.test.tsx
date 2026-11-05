import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Platform } from 'react-native';

import { getDatabase } from '@/db';
import { getFatigueSnapshot } from '@/db/fatigue';
import { SCHEMA_SQL } from '@/db/schema';
import i18n from '@/i18n';
import { createTestDatabase } from '@/test/sqlite';

import FatigueScreen from '../../../app/(tabs)/fatigue';

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: 'MockSystemDateTimePicker',
  DateTimePickerAndroid: {
    open: jest.fn(),
    dismiss: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('@/db', () => ({
  getDatabase: jest.fn(),
  WebDatabaseUnavailableError: class extends Error {},
}));
jest.mock('@/utils/id', () => {
  let id = 0;
  return { generateId: () => `screen-sleep-${++id}` };
});
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
const NOW = new Date(2026, 10, 4, 14, 35).getTime();
let database: ReturnType<typeof createTestDatabase>;
beforeEach(async () => {
  jest.clearAllMocks();
  database = createTestDatabase(SCHEMA_SQL);
  jest.mocked(getDatabase).mockResolvedValue(database.adapter);
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  await i18n.changeLanguage('pl');
});
afterEach(() => {
  jest.restoreAllMocks();
  database.sqlite.close();
});
async function loaded() {
  await render(<FatigueScreen />);
  await waitFor(() => expect(screen.queryByText('Ładowanie...')).toBeNull());
}
async function press(name: string) {
  await fireEvent.press(screen.getByRole('button', { name }));
}
async function fill(label: string, date: string, time: string) {
  const otherTime = screen.queryByRole('button', { name: 'Inna godzina' });
  if (otherTime) await fireEvent.press(otherTime);
  const [day, month, year] = date.split('.').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  for (const [field, selected] of [
    ['Data', new Date(year, month - 1, day, 12)],
    ['Godzina', new Date(2000, 0, 15, hour, minute)],
  ] as const) {
    await fireEvent.press(screen.getByLabelText(`${label}: ${field}`));
    if (field === 'Godzina') {
      await fireEvent.changeText(
        screen.getByLabelText('Godziny'),
        String(hour).padStart(2, '0'),
      );
      await fireEvent.changeText(
        screen.getByLabelText('Minuty'),
        String(minute).padStart(2, '0'),
      );
      await press('Wybierz');
      continue;
    }
    const event = {
      nativeEvent: {
        timestamp: selected.getTime(),
        utcOffset: -selected.getTimezoneOffset(),
      },
    };
    if (Platform.OS === 'android') {
      const options = jest
        .mocked(DateTimePickerAndroid.open)
        .mock.calls.at(-1)![0];
      await act(async () => options.onValueChange?.(event, selected));
    } else {
      await fireEvent(
        screen.getByTestId('system-date-time-picker'),
        'valueChange',
        event,
        selected,
      );
      await press('Wybierz');
    }
  }
}
async function saved() {
  await press('Zapisz');
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Anuluj' })).toBeNull(),
  );
}

it('starts empty without creating records and cancels a form without starting a counter', async () => {
  await loaded();
  expect(screen.getByTestId('fatigue-counter')).toHaveTextContent('—');
  expect(screen.getAllByText('Brak zapisu')).toHaveLength(7);
  await press('Zapisz pobudkę');
  await press('Anuluj');
  expect(await getFatigueSnapshot()).toMatchObject({
    entries: [],
    wokeAt: null,
  });
});

it('records an earlier wake, overnight sleep and wake, and restores the actual saved data', async () => {
  await loaded();
  await press('Zapisz pobudkę');
  await fill('Pobudka', '03.11.2026', '06:00');
  await saved();
  expect(screen.getByTestId('fatigue-counter')).toHaveTextContent('32:35');
  await press('Zapisz początek snu');
  await fill('Początek snu', '03.11.2026', '22:00');
  await saved();
  expect(screen.getByText('Otwarty zapis snu')).toBeOnTheScreen();
  await press('Zapisz pobudkę');
  await fill('Pobudka', '04.11.2026', '06:00');
  await saved();
  expect(screen.getByTestId('fatigue-counter')).toHaveTextContent('08:35');
  expect(screen.getByText('08:00')).toBeOnTheScreen();
  await screen.unmount();
  await loaded();
  expect(screen.getByTestId('fatigue-counter')).toHaveTextContent('08:35');
  expect(screen.getAllByText('Brak zapisu')).toHaveLength(6);
});

it('locks date and time for Now, unlocks only after Another time and saves the selected time source', async () => {
  await loaded();
  await press('Zapisz pobudkę');
  expect(screen.getByLabelText('Pobudka: Data')).toBeDisabled();
  expect(screen.getByLabelText('Pobudka: Godzina')).toBeDisabled();
  await press('Inna godzina');
  expect(screen.getByLabelText('Pobudka: Data')).toBeEnabled();
  expect(screen.getByLabelText('Pobudka: Godzina')).toBeEnabled();
  await fill('Pobudka', '04.11.2026', '06:00');
  await press('Teraz');
  expect(screen.getByLabelText('Pobudka: Data')).toBeDisabled();
  expect(screen.getByLabelText('Pobudka: Godzina')).toBeDisabled();
  jest.mocked(Date.now).mockReturnValue(NOW + 95000);
  await saved();
  expect((await getFatigueSnapshot()).wokeAt).toBe(NOW + 95000);
  jest.mocked(Date.now).mockReturnValue(NOW + 180000);
  await press('Zapisz początek snu');
  expect(screen.getByLabelText('Początek snu: Data')).toBeDisabled();
  expect(screen.getByLabelText('Początek snu: Godzina')).toBeDisabled();
  await fill('Początek snu', '04.11.2026', '14:37');
  expect(screen.getByLabelText('Początek snu: Godzina')).toBeEnabled();
  await saved();
  expect((await getFatigueSnapshot()).entries[0].slept_at).toBe(
    new Date(2026, 10, 4, 14, 37).getTime(),
  );
});

it('retains typed timestamps after a failed save and retries without duplicate records', async () => {
  await loaded();
  await press('Dodaj wcześniejszy sen');
  expect(screen.getByLabelText('Początek snu: Godzina')).toBeEnabled();
  expect(screen.getByLabelText('Pobudka: Godzina')).toBeEnabled();
  await fill('Początek snu', '03.11.2026', '22:00');
  await fill('Pobudka', '04.11.2026', '06:00');
  const original = database.adapter.runAsync;
  database.adapter.runAsync = jest
    .fn()
    .mockRejectedValue(new Error('disk full'));
  await press('Zapisz');
  await waitFor(() =>
    expect(screen.getByText(/Wpisane godziny pozostają/)).toBeOnTheScreen(),
  );
  expect(screen.getByLabelText('Początek snu: Godzina')).toHaveTextContent(
    '22:00',
  );
  expect((await getFatigueSnapshot()).entries).toEqual([]);
  database.adapter.runAsync = original;
  await saved();
  expect((await getFatigueSnapshot()).entries).toHaveLength(1);
});

it('validates future times and asks explicitly which autumn occurrence was intended', async () => {
  await loaded();
  await press('Zapisz pobudkę');
  await fill('Pobudka', '05.11.2026', '06:00');
  await press('Zapisz');
  await waitFor(() =>
    expect(
      screen.getByText('Data i godzina nie mogą być późniejsze niż teraz.'),
    ).toBeOnTheScreen(),
  );
  await fill('Pobudka', '25.10.2026', '02:30');
  await press('Zapisz');
  expect(screen.getByText(/Wybierz pierwsze albo drugie/)).toBeOnTheScreen();
  await fireEvent.press(
    screen.getByRole('radio', { name: 'Drugie wystąpienie (UTC+01:00)' }),
  );
  await saved();
  expect((await getFatigueSnapshot()).wokeAt).toBe(
    Date.parse('2026-10-25T02:30:00+01:00'),
  );
});

it('offers read retry and never presents a failed read as an empty history', async () => {
  jest.mocked(getDatabase).mockRejectedValueOnce(new Error('unavailable'));
  await loaded();
  expect(screen.queryByTestId('fatigue-counter')).toBeNull();
  expect(screen.queryByText('Brak zapisu')).toBeNull();
  expect(screen.getByTestId('fatigue-load-details')).toHaveTextContent(
    /schemat 4: unavailable/,
  );
  await press('Spróbuj ponownie');
  await waitFor(() =>
    expect(screen.getByTestId('fatigue-counter')).toBeOnTheScreen(),
  );
});

it('records an earlier wake through the Android calendar and the default numeric time editor', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await loaded();
  await press('Zapisz pobudkę');
  await fireEvent.press(screen.getByLabelText('Pobudka: Godzina'));
  expect(DateTimePickerAndroid.open).not.toHaveBeenCalled();
  await fill('Pobudka', '03.11.2026', '06:10');
  expect(
    jest
      .mocked(DateTimePickerAndroid.open)
      .mock.calls.map(([options]) => options.mode),
  ).toEqual(['date']);
  await saved();
  expect((await getFatigueSnapshot()).wokeAt).toBe(
    new Date(2026, 10, 3, 6, 10).getTime(),
  );
});
