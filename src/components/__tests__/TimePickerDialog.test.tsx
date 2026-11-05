import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, Keyboard, Platform } from 'react-native';

import type { TimeDialProps } from '@/components/TimeDial.types';
import { TimePickerDialog } from '@/components/TimePickerDialog';
import i18n from '@/i18n';

const onConfirm = jest.fn();
const onCancel = jest.fn();
jest.mock('@/components/TimeDial', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    TimeDial: (props: TimeDialProps) =>
      React.createElement('MockInlineTimeDial', {
        ...props,
        testID: 'inline-time-dial',
      }),
  };
});
const nativeMethods = jest.requireActual<{ default: { focus: jest.Mock } }>(
  '@react-native/jest-preset/jest/MockNativeMethods',
).default;
const focusedLabel = () =>
  (
    nativeMethods.focus.mock.contexts.at(-1) as {
      props: { accessibilityLabel: string };
    }
  ).props.accessibilityLabel;
async function editor() {
  await render(
    <TimePickerDialog
      label="Pobudka"
      value={new Date(2000, 0, 15, 8)}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
}
beforeEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage('pl');
});
afterEach(() => jest.restoreAllMocks());

it('allocates a full-height safe area through native styles without depending on className support', async () => {
  await editor();
  expect(screen.getByTestId('numeric-time-safe-area')).toHaveStyle({ flex: 1 });
});

it.each([
  { orientation: 'portrait', width: 360, height: 640, inputHeight: 64 },
  { orientation: 'landscape', width: 640, height: 360, inputHeight: 48 },
])(
  'places editable fields at the top without receiving any keyboard event in $orientation',
  async ({ width, height, inputHeight }) => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width, height, scale: 1, fontScale: 1 });
    await editor();
    expect(screen.getByTestId('numeric-time-scroll')).toHaveProp(
      'contentContainerStyle',
      {
        flexGrow: 1,
        justifyContent: 'flex-start',
        padding: height < 420 ? 8 : 16,
      },
    );
    expect(screen.getByLabelText('Godziny')).toHaveStyle({
      minHeight: inputHeight,
    });
    expect(screen.getByLabelText('Minuty')).toHaveStyle({
      minHeight: inputHeight,
    });
    await fireEvent.changeText(screen.getByLabelText('Godziny'), '06');
    await fireEvent.changeText(screen.getByLabelText('Minuty'), '37');
    await fireEvent.press(screen.getByRole('button', { name: 'Wybierz' }));
    expect(onConfirm).toHaveBeenCalledWith(new Date(2000, 0, 15, 6, 37));
  },
);

it.each([
  { orientation: 'portrait', height: 800, keyboardTop: 480 },
  { orientation: 'landscape', height: 360, keyboardTop: 160 },
])(
  'resizes the Android editor above the keyboard in $orientation',
  async ({ height, keyboardTop }) => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const listeners = jest.spyOn(Keyboard, 'addListener');
    await editor();
    await fireEvent(
      screen.getByTestId('numeric-time-keyboard-area'),
      'layout',
      {
        persist: jest.fn(),
        nativeEvent: { layout: { x: 0, y: 0, width: 400, height } },
      },
    );
    const show = listeners.mock.calls.find(
      ([name]) => name === 'keyboardDidShow',
    )?.[1];
    expect(show).toBeDefined();
    await act(async () => {
      show?.({
        duration: 0,
        easing: 'keyboard',
        endCoordinates: {
          screenX: 0,
          screenY: keyboardTop,
          width: 400,
          height: height - keyboardTop,
        },
      });
    });
    expect(screen.getByTestId('numeric-time-keyboard-area')).toHaveStyle({
      height: keyboardTop,
      flex: 0,
    });
    const hide = listeners.mock.calls.find(
      ([name]) => name === 'keyboardDidHide',
    )?.[1];
    await act(async () => {
      hide?.({
        duration: 0,
        easing: 'keyboard',
        endCoordinates: { screenX: 0, screenY: height, width: 400, height: 0 },
      });
    });
    expect(screen.getByTestId('numeric-time-keyboard-area')).toHaveStyle({
      flex: 1,
    });
  },
);

it('requests numeric keyboards and moves to minutes only after two valid hour digits', async () => {
  await editor();
  const minuteFocus = nativeMethods.focus;
  expect(screen.getByLabelText('Godziny')).toHaveProp('inputMode', 'numeric');
  expect(screen.getByLabelText('Minuty')).toHaveProp('inputMode', 'numeric');
  await fireEvent.changeText(screen.getByLabelText('Godziny'), '0');
  expect(minuteFocus).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Godziny'), '06');
  expect(minuteFocus).toHaveBeenCalledTimes(1);
  expect(focusedLabel()).toBe('Minuty');
  await fireEvent.changeText(screen.getByLabelText('Godziny'), '29');
  expect(minuteFocus).toHaveBeenCalledTimes(1);
  expect(
    screen.getByText('Godziny muszą mieścić się w zakresie 00–23.'),
  ).toBeOnTheScreen();
});

it('selects the existing digits on each focus and replaces them with successive keystrokes', async () => {
  await editor();
  const hours = () => screen.getByLabelText('Godziny');
  const minutes = () => screen.getByLabelText('Minuty');
  async function key(field: typeof hours, digit: string) {
    const input = field();
    const text = input.props.value as string;
    const range = input.props.selection as { start: number; end: number };
    const next = text.slice(0, range.start) + digit + text.slice(range.end);
    await fireEvent.changeText(input, next);
    await fireEvent(field(), 'selectionChange', {
      nativeEvent: {
        selection: { start: range.start + 1, end: range.start + 1 },
      },
    });
  }
  await fireEvent(hours(), 'focus');
  expect(hours()).toHaveProp('selection', { start: 0, end: 2 });
  await key(hours, '0');
  expect(hours()).toHaveDisplayValue('0');
  await key(hours, '6');
  expect(hours()).toHaveDisplayValue('06');
  expect(focusedLabel()).toBe('Minuty');
  await fireEvent(minutes(), 'focus');
  expect(minutes()).toHaveProp('selection', { start: 0, end: 2 });
  await key(minutes, '3');
  await key(minutes, '7');
  expect(minutes()).toHaveDisplayValue('37');
  await fireEvent(hours(), 'focus');
  expect(hours()).toHaveProp('selection', { start: 0, end: 2 });
  await key(hours, '1');
  await key(hours, '2');
  expect(hours()).toHaveDisplayValue('12');
  await fireEvent.press(screen.getByRole('button', { name: 'Wybierz' }));
  expect(onConfirm).toHaveBeenCalledWith(new Date(2000, 0, 15, 12, 37));
});

it('returns to hours from empty minutes and never commits invalid or missing parts', async () => {
  await editor();
  const hourFocus = nativeMethods.focus;
  await fireEvent.changeText(screen.getByLabelText('Minuty'), '');
  await fireEvent(screen.getByLabelText('Minuty'), 'keyPress', {
    nativeEvent: { key: 'Backspace' },
  });
  expect(hourFocus).toHaveBeenCalledTimes(1);
  expect(focusedLabel()).toBe('Godziny');
  await fireEvent.press(screen.getByRole('button', { name: 'Wybierz' }));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByText('Uzupełnij godziny i minuty.')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Minuty'), '69');
  await fireEvent.press(screen.getByRole('button', { name: 'Wybierz' }));
  expect(onConfirm).not.toHaveBeenCalled();
});

it('accepts a pasted time, normalizes single digits and cancels without applying a draft', async () => {
  await editor();
  await fireEvent.changeText(screen.getByLabelText('Godziny'), '24:00');
  await fireEvent.press(screen.getByRole('button', { name: 'Wybierz' }));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      'Nie udało się wstawić tej wartości. Wpisz godziny 00–23 i minuty 00–59.',
    ),
  ).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Godziny'), '06:37');
  expect(screen.getByLabelText('Godziny')).toHaveDisplayValue('06');
  expect(screen.getByLabelText('Minuty')).toHaveDisplayValue('37');
  await fireEvent.changeText(screen.getByLabelText('Godziny'), '7');
  await fireEvent.changeText(screen.getByLabelText('Minuty'), '5');
  await fireEvent.press(screen.getByRole('button', { name: 'Wybierz' }));
  expect(onConfirm).toHaveBeenCalledWith(new Date(2000, 0, 15, 7, 5));
  onConfirm.mockClear();
  await fireEvent.changeText(screen.getByLabelText('Godziny'), '11');
  await fireEvent.press(screen.getByRole('button', { name: 'Anuluj' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

it('switches a single dialog between numeric entry and the dial without losing or committing the draft', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await editor();
  await fireEvent.changeText(screen.getByLabelText('Godziny'), '06');
  await fireEvent.changeText(screen.getByLabelText('Minuty'), '37');
  await fireEvent.press(screen.getByRole('button', { name: 'Tarcza' }));
  expect(screen.queryByLabelText('Godziny')).toBeNull();
  expect(screen.getByTestId('inline-time-dial')).toHaveProp(
    'value',
    new Date(2000, 0, 15, 6, 37),
  );
  expect(screen.getAllByRole('button', { name: 'Wybierz' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Anuluj' })).toHaveLength(1);
  expect(onConfirm).not.toHaveBeenCalled();
  const selected = new Date(2000, 0, 15, 23, 59);
  await fireEvent(screen.getByTestId('inline-time-dial'), 'change', selected);
  await fireEvent.press(screen.getByRole('button', { name: 'Klawiatura' }));
  expect(screen.getByLabelText('Godziny')).toHaveDisplayValue('23');
  expect(screen.getByLabelText('Minuty')).toHaveDisplayValue('59');
  expect(screen.queryByTestId('inline-time-dial')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Tarcza' }));
  expect(screen.getByTestId('inline-time-dial')).toHaveProp('value', selected);
  await fireEvent.press(screen.getByRole('button', { name: 'Wybierz' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledWith(selected);
});

it('cancels the whole dialog after a dial edit without applying it', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await editor();
  await fireEvent.press(screen.getByRole('button', { name: 'Tarcza' }));
  await fireEvent(
    screen.getByTestId('inline-time-dial'),
    'change',
    new Date(2000, 0, 15, 0, 0),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Anuluj' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

it('keeps invalid numeric input when switching modes and blocks incomplete picker values', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await editor();
  await fireEvent.changeText(screen.getByLabelText('Godziny'), '29');
  await fireEvent.press(screen.getByRole('button', { name: 'Tarcza' }));
  expect(screen.queryByTestId('inline-time-dial')).toBeNull();
  expect(screen.getByLabelText('Godziny')).toHaveDisplayValue('29');
  await fireEvent.changeText(screen.getByLabelText('Godziny'), '23');
  await fireEvent.press(screen.getByRole('button', { name: 'Tarcza' }));
  await fireEvent(screen.getByTestId('inline-time-dial'), 'change', null);
  await fireEvent.press(screen.getByRole('button', { name: 'Wybierz' }));
  expect(onConfirm).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Klawiatura' }));
  expect(screen.getByLabelText('Godziny')).toHaveDisplayValue('');
  expect(screen.getByLabelText('Minuty')).toHaveDisplayValue('');
  await fireEvent.changeText(screen.getByLabelText('Godziny'), '00');
  await fireEvent.changeText(screen.getByLabelText('Minuty'), '00');
  await fireEvent.press(screen.getByRole('button', { name: 'Wybierz' }));
  expect(onConfirm).toHaveBeenCalledWith(new Date(2000, 0, 15, 0, 0));
});
