import { DateTimePicker, Host } from '@expo/ui/jetpack-compose';
import { act, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { TimeDial } from '@/components/TimeDial.android';

jest.mock('@expo/ui/jetpack-compose', () => ({
  Host: jest.fn(({ children }: { children: ReactNode }) => children),
  DateTimePicker: jest.fn(() => null),
}));
const onChange = jest.fn();
const initial = new Date(2000, 0, 15, 6, 37);
beforeEach(() => jest.clearAllMocks());

it('uses an inline 24-hour clock and reports valid, midnight and invalid native selections', async () => {
  await render(
    <TimeDial label="Pobudka" value={initial} onChange={onChange} />,
  );
  const props = jest.mocked(DateTimePicker).mock.calls.at(-1)![0];
  expect(props.displayedComponents).toBe('hourAndMinute');
  expect(props.variant).toBe('picker');
  expect(props.showVariantToggle).toBe(false);
  expect(props.is24Hour).toBe(true);
  expect(props.initialDate).toBe(initial.toISOString());
  expect(jest.mocked(Host).mock.calls.at(-1)![0]).toMatchObject({
    matchContents: { vertical: true },
    style: { width: '100%' },
  });
  const midnight = new Date(2000, 0, 15, 0, 0);
  await act(async () => props.onDateSelected?.(midnight));
  expect(onChange).toHaveBeenLastCalledWith(midnight);
  await act(async () => props.onDateSelected?.(null));
  expect(onChange).toHaveBeenLastCalledWith(null);
  await act(async () => props.onDateSelected?.(new Date(NaN)));
  expect(onChange).toHaveBeenLastCalledWith(null);
});

it('retains its native seed while the draft changes and starts a new seed only when reopened', async () => {
  const view = await render(
    <TimeDial label="Pobudka" value={initial} onChange={onChange} />,
  );
  const selected = new Date(2000, 0, 15, 23, 59);
  await screen.rerender(
    <TimeDial label="Pobudka" value={selected} onChange={onChange} />,
  );
  expect(jest.mocked(DateTimePicker).mock.calls.at(-1)![0].initialDate).toBe(
    initial.toISOString(),
  );
  await view.unmount();
  await render(
    <TimeDial label="Pobudka" value={selected} onChange={onChange} />,
  );
  expect(jest.mocked(DateTimePicker).mock.calls.at(-1)![0].initialDate).toBe(
    selected.toISOString(),
  );
});
