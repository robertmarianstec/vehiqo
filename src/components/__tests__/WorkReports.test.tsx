import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, AppState, type AppStateStatus, Platform } from 'react-native';

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
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///vehiqo-cache', basename: () => 'report.pdf' },
  File: class {
    uri: string;
    constructor(parent: string, name?: string) {
      this.uri = name ? `${parent}/${name}` : parent;
    }
    write = mockWritePdf;
    canPreview = mockCanPreviewPdf;
    preview = mockPreviewPdf;
  },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

const HOUR = 3_600_000;
const mockWritePdf = jest.fn();
const mockCanPreviewPdf = jest.fn();
const mockPreviewPdf = jest.fn();
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
  jest.mocked(Print.printToFileAsync).mockReset().mockResolvedValue({
    uri: 'file:///report.pdf',
    numberOfPages: 1,
    base64: 'JVBERi0xLjc=',
  });
  jest.mocked(Sharing.isAvailableAsync).mockReset().mockResolvedValue(true);
  jest.mocked(Sharing.shareAsync).mockReset().mockResolvedValue();
  mockWritePdf.mockReset().mockResolvedValue(undefined);
  mockCanPreviewPdf.mockReset().mockResolvedValue(true);
  mockPreviewPdf.mockReset().mockResolvedValue(undefined);
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
  expect(screen.getByRole('button', { name: 'Przygotuj PDF' })).toBeDisabled();
});

it('supports retry after a database error', async () => {
  jest
    .mocked(getWorkSessionsInRange)
    .mockRejectedValueOnce(new Error('read failed'));
  await loaded();
  expect(screen.getByRole('alert')).toHaveTextContent(
    i18n.t('reports.loadError'),
  );
  expect(screen.getByRole('button', { name: 'Przygotuj PDF' })).toBeDisabled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Spróbuj ponownie' }),
  );
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(screen.getByText('49:45')).toBeOnTheScreen();
});

it('opens the selected month as a PDF with the displayed snapshot without sharing', async () => {
  await loaded();
  await fireEvent.press(screen.getByRole('button', { name: 'Miesiąc' }));
  await waitFor(() => expect(screen.getByText('09:00')).toBeOnTheScreen());
  jest.setSystemTime(NOW + HOUR);
  await fireEvent.press(screen.getByRole('button', { name: 'Przygotuj PDF' }));
  await waitFor(() =>
    expect(mockPreviewPdf).toHaveBeenCalledWith({
      mimeType: 'application/pdf',
    }),
  );
  expect(mockCanPreviewPdf).toHaveBeenCalledWith({
    mimeType: 'application/pdf',
  });
  expect(Sharing.isAvailableAsync).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  const options = jest.mocked(Print.printToFileAsync).mock.calls[0][0];
  expect(options).toMatchObject({ width: 595, height: 842 });
  expect(mockWritePdf).not.toHaveBeenCalled();
  expect(mockPreviewPdf.mock.contexts[0]).toMatchObject({
    uri: 'file:///report.pdf',
  });
  expect(options?.html).toContain('Miesiąc');
  expect(options?.html).toContain('09:00');
  expect(options?.html).toContain('02:00');
  expect(options?.html).toContain('12:00');
  expect(options?.html).toContain('13:00');
});

it('blocks duplicate exports and period changes while generating, then unlocks', async () => {
  let finish!: (value: Print.FilePrintResult) => void;
  jest.mocked(Print.printToFileAsync).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await loaded();
  await fireEvent.press(screen.getByRole('button', { name: 'Przygotuj PDF' }));
  expect(screen.getByRole('button', { name: 'Tworzenie PDF…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Miesiąc' })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Poprzedni okres' }),
  ).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Tworzenie PDF…' }));
  expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
  await act(() => finish({ uri: 'file:///report.pdf', numberOfPages: 1 }));
  expect(screen.getByRole('button', { name: 'Przygotuj PDF' })).toBeEnabled();
});

it('waits for the Android PDF to be written in the app cache before opening it', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  let finishWrite!: () => void;
  mockWritePdf.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishWrite = resolve;
    }),
  );
  jest.mocked(Print.printToFileAsync).mockResolvedValueOnce({
    uri: 'file:///unreadable-print-cache/report.pdf',
    numberOfPages: 1,
    base64: 'JVBERi0xLjc=',
  });
  try {
    await loaded();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Przygotuj PDF' }),
    );
    await waitFor(() =>
      expect(mockWritePdf).toHaveBeenCalledWith('JVBERi0xLjc=', {
        encoding: 'base64',
      }),
    );
    expect(Print.printToFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({ base64: true }),
    );
    expect(mockCanPreviewPdf).not.toHaveBeenCalled();
    expect(mockPreviewPdf).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Tworzenie PDF…' }),
    ).toBeDisabled();
    await act(() => finishWrite());
    expect(mockPreviewPdf).toHaveBeenCalledWith({
      mimeType: 'application/pdf',
    });
    expect(mockPreviewPdf.mock.contexts[0]).toMatchObject({
      uri: 'file:///vehiqo-cache/report.pdf',
    });
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  } finally {
    platform.restore();
  }
});

it.each(['print', 'preview', 'check', 'write', 'missing'] as const)(
  'keeps the report and allows retry after %s failure',
  async (failure) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const platform =
      failure === 'write' || failure === 'missing'
        ? jest.replaceProperty(Platform, 'OS', 'android')
        : undefined;
    try {
      if (failure === 'print')
        jest
          .mocked(Print.printToFileAsync)
          .mockRejectedValueOnce(new Error('print failed'));
      if (failure === 'preview')
        mockPreviewPdf.mockRejectedValueOnce(new Error('preview failed'));
      if (failure === 'check')
        mockCanPreviewPdf.mockRejectedValueOnce(new Error('check failed'));
      if (failure === 'write')
        mockWritePdf.mockRejectedValueOnce(new Error('write failed'));
      if (failure === 'missing')
        jest.mocked(Print.printToFileAsync).mockResolvedValueOnce({
          uri: 'file:///unreadable-print-cache/report.pdf',
          numberOfPages: 1,
        });
      await loaded();
      await fireEvent.press(
        screen.getByRole('button', { name: 'Przygotuj PDF' }),
      );
      await waitFor(() => expect(alert).toHaveBeenCalled());
      expect(screen.getByText('49:45')).toBeOnTheScreen();
      expect(
        screen.getByRole('button', { name: 'Przygotuj PDF' }),
      ).toBeEnabled();
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
      await fireEvent.press(
        screen.getByRole('button', { name: 'Przygotuj PDF' }),
      );
      await waitFor(() =>
        expect(mockPreviewPdf).toHaveBeenCalledTimes(
          failure === 'preview' ? 2 : 1,
        ),
      );
    } finally {
      platform?.restore();
      alert.mockRestore();
    }
  },
);

it('offers sharing only after detecting no PDF viewer and shares the created file on request', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockCanPreviewPdf.mockResolvedValueOnce(false);
  try {
    await loaded();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Przygotuj PDF' }),
    );
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert).toHaveBeenCalledWith(
      i18n.t('reports.pdf.title'),
      i18n.t('reports.pdf.noViewer'),
      expect.any(Array),
    );
    expect(mockPreviewPdf).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2];
    const share = buttons?.find(
      (button) => button.text === i18n.t('reports.pdf.share'),
    );
    expect(share?.onPress).toBeDefined();
    await act(() => share?.onPress?.());
    expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///vehiqo-cache/report.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  } finally {
    platform.restore();
    alert.mockRestore();
  }
});

it.each(['unavailable', 'share'] as const)(
  'allows retry after fallback sharing is %s',
  async (failure) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockCanPreviewPdf.mockResolvedValueOnce(false);
    if (failure === 'unavailable')
      jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
    else
      jest
        .mocked(Sharing.shareAsync)
        .mockRejectedValueOnce(new Error('share failed'));
    try {
      await loaded();
      await fireEvent.press(
        screen.getByRole('button', { name: 'Przygotuj PDF' }),
      );
      await waitFor(() => expect(alert).toHaveBeenCalled());
      await act(() => alert.mock.calls[0][2]?.[1].onPress?.());
      expect(alert).toHaveBeenLastCalledWith(
        i18n.t('reports.pdf.title'),
        i18n.t(
          failure === 'unavailable'
            ? 'reports.pdf.sharingUnavailable'
            : 'reports.pdf.error',
        ),
      );
      expect(
        screen.getByRole('button', { name: 'Przygotuj PDF' }),
      ).toBeEnabled();
      await fireEvent.press(
        screen.getByRole('button', { name: 'Przygotuj PDF' }),
      );
      await waitFor(() => expect(mockPreviewPdf).toHaveBeenCalled());
    } finally {
      alert.mockRestore();
    }
  },
);

it('does not replace a newer selection with a late read for the old period', async () => {
  let finishOldRead!: (value: WorkSession[]) => void;
  jest.mocked(getWorkSessionsInRange).mockReturnValueOnce(
    new Promise((resolve) => {
      finishOldRead = resolve;
    }),
  );
  await render(<ReportsScreen />);
  expect(screen.getByRole('button', { name: 'Przygotuj PDF' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Miesiąc' }));
  await waitFor(() => expect(screen.queryByText('Ładowanie...')).toBeNull());
  expect(screen.getByText('09:00')).toBeOnTheScreen();
  await act(() => finishOldRead([]));
  expect(screen.getByText('09:00')).toBeOnTheScreen();
  expect(screen.queryByText('Brak zapisanego czasu')).toBeNull();
});

it('does not print the application screen when PDF export is opened on web', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'web');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    await loaded();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Przygotuj PDF' }),
    );
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        i18n.t('reports.pdf.title'),
        i18n.t('reports.pdf.unavailable'),
      ),
    );
    expect(Print.printToFileAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  } finally {
    platform.restore();
    alert.mockRestore();
  }
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
