import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Alert } from 'react-native';

import { getThemePreference, setThemePreference } from '@/db/queries';
import i18n from '@/i18n';

import SettingsScreen from '../../../app/(tabs)/settings';

jest.mock('@/db/queries', () => ({
  getThemePreference: jest.fn(),
  setThemePreference: jest.fn(),
  clearAllLocalData: jest.fn(),
}));

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(getThemePreference).mockResolvedValue('light');
  jest.mocked(setThemePreference).mockResolvedValue(undefined);
  await i18n.changeLanguage('pl');
});

it('keeps activity reports outside the app settings', async () => {
  await render(<SettingsScreen />);
  expect(
    screen.queryByRole('link', { name: i18n.t('reports.title') }),
  ).toBeNull();
});

it('reports a failed theme save and keeps the previous selection', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    await render(<SettingsScreen />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Jasny/, selected: true }),
      ).toBeOnTheScreen(),
    );
    jest
      .mocked(setThemePreference)
      .mockRejectedValueOnce(new Error('disk full'));
    await fireEvent.press(screen.getByRole('button', { name: /Ciemny/ }));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        i18n.t('common.error'),
        i18n.t('settings.theme.saveError'),
      ),
    );
    expect(
      screen.getByRole('button', { name: /Jasny/, selected: true }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Ciemny/ }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Ciemny/, selected: true }),
      ).toBeOnTheScreen(),
    );
  } finally {
    alert.mockRestore();
  }
});

it('shows a read error and restores the theme controls after retry', async () => {
  jest
    .mocked(getThemePreference)
    .mockRejectedValueOnce(new Error('read failed'));
  await render(<SettingsScreen />);
  await waitFor(() =>
    expect(
      screen.getByText(i18n.t('settings.theme.loadError')),
    ).toBeOnTheScreen(),
  );
  expect(screen.queryByRole('button', { name: /Jasny/ })).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: i18n.t('common.retry') }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /Jasny/, selected: true }),
    ).toBeOnTheScreen(),
  );
});
