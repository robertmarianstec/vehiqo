import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import type { DailyCheckRecord } from '@/db/types';
import { openDailyCheckPdf } from '@/services/dailyCheckPdf';
import {
  PdfPreviewUnavailableError,
  PdfSharingUnavailableError,
  PdfViewerUnavailableError,
  shareWorkReportPdf,
} from '@/services/workReportPdf';

export function useDailyCheckPdf() {
  const { t, i18n } = useTranslation();
  const locked = useRef(false);
  const [isExporting, setIsExporting] = useState(false);

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setIsExporting(true);
    try {
      await action();
    } catch (error) {
      if (error instanceof PdfViewerUnavailableError) {
        Alert.alert(t('dailyCheck.pdf.title'), t('dailyCheck.pdf.noViewer'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('reports.pdf.share'),
            onPress: () => {
              void run(() => shareWorkReportPdf(error.uri));
            },
          },
        ]);
      } else {
        Alert.alert(
          t('dailyCheck.pdf.title'),
          t(
            error instanceof PdfPreviewUnavailableError
              ? 'dailyCheck.pdf.unavailable'
              : error instanceof PdfSharingUnavailableError
                ? 'reports.pdf.sharingUnavailable'
                : 'dailyCheck.pdf.error',
          ),
        );
      }
    } finally {
      locked.current = false;
      setIsExporting(false);
    }
  }

  return {
    isExporting,
    exportCheck: (record: DailyCheckRecord) =>
      run(() =>
        openDailyCheckPdf(record, { locale: i18n.resolvedLanguage ?? 'en', t }),
      ),
  };
}
