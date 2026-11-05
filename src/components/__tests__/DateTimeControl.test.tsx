import {
  DateTimePickerAndroid,
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { DateTimeControl } from '@/components/DateTimeControl';
import i18n from '@/i18n';

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: 'MockSystemDateTimePicker',
  DateTimePickerAndroid: {
    open: jest.fn(),
    dismiss: jest.fn().mockResolvedValue(true),
  },
}));
const selected = new Date(2000, 0, 15, 6, 10);
const event: DateTimePickerChangeEvent = {
  nativeEvent: {
    timestamp: selected.getTime(),
    utcOffset: -selected.getTimezoneOffset(),
  },
};
const onChange = jest.fn();
async function control(mode: 'date' | 'time' = 'time') {
  return render(
    <DateTimeControl
      mode={mode}
      label={`Pobudka: ${mode === 'date' ? 'Data' : 'Godzina'}`}
      text="08:00"
      value={new Date(2000, 0, 15, 8)}
      now={new Date(2026, 10, 4, 14, 35).getTime()}
      selected
      disabled={false}
      onChange={onChange}
    />,
  );
}
beforeEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage('pl');
});
afterEach(() => jest.restoreAllMocks());

it('keeps an inline iOS wheel change in the shared draft and cancels the entire time dialog', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await control();
  await fireEvent.press(screen.getByLabelText('Pobudka: Godzina'));
  await fireEvent.press(screen.getByRole('button', { name: 'Pokrętła' }));
  expect(screen.getByTestId('numeric-time-safe-area')).toHaveStyle({
    flex: 1,
  });
  await fireEvent(
    screen.getByTestId('inline-time-dial'),
    'valueChange',
    event,
    selected,
  );
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Anuluj' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.queryByTestId('inline-time-dial')).toBeNull();
  expect(screen.queryByTestId('numeric-time-dialog')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Pobudka: Godzina'));
  await fireEvent.press(screen.getByRole('button', { name: 'Pokrętła' }));
  await fireEvent(
    screen.getByTestId('inline-time-dial'),
    'valueChange',
    event,
    selected,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Wybierz' }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(selected);
});

it('retains the Android calendar bounds, cancellation and retry after a native error', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await control('date');
  await fireEvent.press(screen.getByLabelText('Pobudka: Data'));
  const first = jest.mocked(DateTimePickerAndroid.open).mock.calls[0][0];
  expect(first.mode).toBe('date');
  expect(first.minimumDate).toEqual(new Date(0));
  expect(first.maximumDate).toEqual(new Date(2026, 10, 4, 14, 35));
  await act(async () => first.onDismiss?.());
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Pobudka: Data'));
  const second = jest.mocked(DateTimePickerAndroid.open).mock.calls[1][0];
  await act(async () => second.onError?.(new Error('native picker failed')));
  expect(
    screen.getByText(
      'Nie udało się otworzyć wyboru daty lub godziny. Spróbuj ponownie.',
    ),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText('Pobudka: Data'));
  const third = jest.mocked(DateTimePickerAndroid.open).mock.calls[2][0];
  await act(async () => third.onValueChange?.(event, selected));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(selected);
});

it('dismisses an open Android calendar on unmount and ignores a late selection callback', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const view = await control('date');
  await fireEvent.press(screen.getByLabelText('Pobudka: Data'));
  const options = jest.mocked(DateTimePickerAndroid.open).mock.calls[0][0];
  await view.unmount();
  expect(DateTimePickerAndroid.dismiss).toHaveBeenCalledWith('date');
  await act(async () => options.onValueChange?.(event, selected));
  expect(onChange).not.toHaveBeenCalled();
});

it('switches time modes inline and commits once without opening another Android dialog', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await control();
  await fireEvent.press(screen.getByLabelText('Pobudka: Godzina'));
  await fireEvent.changeText(screen.getByLabelText('Godziny'), '11');
  await fireEvent.changeText(screen.getByLabelText('Minuty'), '42');
  await fireEvent.press(screen.getByRole('button', { name: 'Tarcza' }));
  await fireEvent(
    screen.getByTestId('inline-time-dial'),
    'valueChange',
    event,
    selected,
  );
  expect(DateTimePickerAndroid.open).not.toHaveBeenCalled();
  expect(screen.queryByTestId('system-date-time-dialog')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Klawiatura' }));
  expect(screen.getByLabelText('Godziny')).toHaveDisplayValue('06');
  expect(screen.getByLabelText('Minuty')).toHaveDisplayValue('10');
  await fireEvent.press(screen.getByRole('button', { name: 'Wybierz' }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(selected);
});
