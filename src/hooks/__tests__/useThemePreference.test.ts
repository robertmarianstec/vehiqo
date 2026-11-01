import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Appearance } from 'react-native';

import { getThemePreference, setThemePreference } from '@/db/queries';
import { useThemePreference } from '@/hooks/useThemePreference';

jest.mock('@/db/queries', () => ({
  getThemePreference: jest.fn(),
  setThemePreference: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getThemePreference).mockResolvedValue('light');
  jest.mocked(setThemePreference).mockResolvedValue(undefined);
});

it('preserves the displayed and native theme when saving fails', async () => {
  const applyTheme = jest.spyOn(Appearance, 'setColorScheme');
  try {
    const { result } = await renderHook(useThemePreference);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    applyTheme.mockClear();
    jest
      .mocked(setThemePreference)
      .mockRejectedValueOnce(new Error('disk full'));
    await act(() =>
      expect(result.current.setPreference('dark')).rejects.toThrow('disk full'),
    );
    expect(result.current.preference).toBe('light');
    expect(applyTheme).not.toHaveBeenCalled();
  } finally {
    applyTheme.mockRestore();
  }
});

it('applies the theme only after the write is confirmed', async () => {
  let completeWrite!: () => void;
  jest.mocked(setThemePreference).mockReturnValueOnce(
    new Promise((resolve) => {
      completeWrite = resolve;
    }),
  );
  const { result } = await renderHook(useThemePreference);
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  let saving!: Promise<void>;
  await act(() => {
    saving = result.current.setPreference('dark');
  });
  expect(result.current.preference).toBe('light');
  await act(async () => {
    completeWrite();
    await saving;
  });
  expect(result.current.preference).toBe('dark');
});

it('recovers from a failed read', async () => {
  jest
    .mocked(getThemePreference)
    .mockRejectedValueOnce(new Error('read failed'));
  const { result } = await renderHook(useThemePreference);
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.loadError).toBe(true);
  await act(() => result.current.retryLoad());
  await waitFor(() => expect(result.current.loadError).toBe(false));
  expect(result.current.preference).toBe('light');
});

it('restores the native theme when reading settings succeeds after a failure', async () => {
  const applyTheme = jest.spyOn(Appearance, 'setColorScheme');
  try {
    jest
      .mocked(getThemePreference)
      .mockRejectedValueOnce(new Error('read failed'));
    const { result } = await renderHook(useThemePreference);
    await waitFor(() => expect(result.current.loadError).toBe(true));
    expect(applyTheme).not.toHaveBeenCalled();
    await act(() => result.current.retryLoad());
    await waitFor(() => expect(result.current.loadError).toBe(false));
    expect(applyTheme).toHaveBeenCalledWith('light');
  } finally {
    applyTheme.mockRestore();
  }
});

it('does not save a selection before the initial preference has loaded', async () => {
  let completeRead!: (preference: 'dark') => void;
  jest.mocked(getThemePreference).mockReturnValueOnce(
    new Promise((resolve) => {
      completeRead = resolve;
    }),
  );
  const { result } = await renderHook(useThemePreference);
  await act(() => result.current.setPreference('light'));
  expect(setThemePreference).not.toHaveBeenCalled();
  await act(() => completeRead('dark'));
  expect(result.current.preference).toBe('dark');
});

it('prevents overlapping writes and permits another attempt after failure', async () => {
  let failWrite!: (reason: Error) => void;
  jest.mocked(setThemePreference).mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      failWrite = reject;
    }),
  );
  const { result } = await renderHook(useThemePreference);
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  let saving!: Promise<void>;
  await act(async () => {
    saving = result.current.setPreference('dark');
    await result.current.setPreference('system');
  });
  expect(setThemePreference).toHaveBeenCalledTimes(1);
  expect(result.current.isSaving).toBe(true);
  await act(async () => {
    const failed = expect(saving).rejects.toThrow('disk full');
    failWrite(new Error('disk full'));
    await failed;
  });
  expect(result.current.preference).toBe('light');
  expect(result.current.isSaving).toBe(false);
  await act(() => result.current.setPreference('dark'));
  expect(result.current.preference).toBe('dark');
});

it.each(['system', 'light', 'dark'] as const)(
  'applies the saved %s preference to the native appearance',
  async (preference) => {
    const applyTheme = jest.spyOn(Appearance, 'setColorScheme');
    try {
      const { result } = await renderHook(useThemePreference);
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(() => result.current.setPreference(preference));
      expect(setThemePreference).toHaveBeenCalledWith(preference);
      expect(applyTheme).toHaveBeenCalledWith(
        preference === 'system' ? 'unspecified' : preference,
      );
      expect(result.current.preference).toBe(preference);
    } finally {
      applyTheme.mockRestore();
    }
  },
);
