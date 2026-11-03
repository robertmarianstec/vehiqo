import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { useDailyCheckPdf } from '@/hooks/useDailyCheckPdf';
import i18n from '@/i18n';
import { openDailyCheckPdf } from '@/services/dailyCheckPdf';
import {
  PdfPreviewUnavailableError,
  PdfViewerUnavailableError,
  shareWorkReportPdf,
} from '@/services/workReportPdf';
import { dailyCheckFixture } from '@/test/dailyCheck';

jest.mock('@/services/dailyCheckPdf', () => ({ openDailyCheckPdf: jest.fn() }));
jest.mock('@/services/workReportPdf', () => ({
  PdfPreviewUnavailableError: class extends Error {},
  PdfSharingUnavailableError: class extends Error {},
  PdfViewerUnavailableError: class extends Error {
    uri: string;
    constructor(uri: string) {
      super('No viewer');
      this.uri = uri;
    }
  },
  shareWorkReportPdf: jest.fn(),
}));
beforeEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage('pl');
  jest.mocked(openDailyCheckPdf).mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());

it('prevents double export and releases the lock when preview finishes', async () => {
  let finish!: () => void;
  jest.mocked(openDailyCheckPdf).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const hook = await renderHook(useDailyCheckPdf);
  let pending!: Promise<void>;
  await act(() => {
    pending = hook.result.current.exportCheck(dailyCheckFixture());
  });
  expect(hook.result.current.isExporting).toBe(true);
  await act(() => hook.result.current.exportCheck(dailyCheckFixture()));
  expect(openDailyCheckPdf).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
    await pending;
  });
  expect(hook.result.current.isExporting).toBe(false);
});

it('offers sharing after a missing viewer only on explicit request', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest
    .mocked(openDailyCheckPdf)
    .mockRejectedValueOnce(
      new PdfViewerUnavailableError('file:///inspection.pdf'),
    );
  const hook = await renderHook(useDailyCheckPdf);
  await act(() => hook.result.current.exportCheck(dailyCheckFixture()));
  expect(shareWorkReportPdf).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith(
    'Przegląd pojazdu',
    expect.stringContaining('nie ma aplikacji'),
    expect.any(Array),
  );
  const share = alert.mock.calls[0][2]!.find(
    (button) => button.text === 'Udostępnij PDF',
  )!;
  await act(async () => {
    share.onPress?.();
  });
  await waitFor(() =>
    expect(shareWorkReportPdf).toHaveBeenCalledWith('file:///inspection.pdf'),
  );
});

it('reports failure without getting stuck and allows another attempt', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest
    .mocked(openDailyCheckPdf)
    .mockRejectedValueOnce(new Error('print failed'));
  const hook = await renderHook(useDailyCheckPdf);
  await act(() => hook.result.current.exportCheck(dailyCheckFixture()));
  expect(alert).toHaveBeenCalledWith(
    'Przegląd pojazdu',
    expect.stringContaining('Nie udało się'),
  );
  await act(() => hook.result.current.exportCheck(dailyCheckFixture()));
  expect(openDailyCheckPdf).toHaveBeenCalledTimes(2);
});

it('explains the native requirement in a browser', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest
    .mocked(openDailyCheckPdf)
    .mockRejectedValueOnce(new PdfPreviewUnavailableError());
  const hook = await renderHook(useDailyCheckPdf);
  await act(() => hook.result.current.exportCheck(dailyCheckFixture()));
  expect(alert).toHaveBeenCalledWith(
    'Przegląd pojazdu',
    expect.stringContaining('Androidzie lub iOS'),
  );
});
