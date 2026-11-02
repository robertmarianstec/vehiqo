import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import {
  openWorkReportPdf,
  PdfPreviewUnavailableError,
  PdfSharingUnavailableError,
  PdfViewerUnavailableError,
  shareWorkReportPdf,
} from '@/services/workReportPdf';
import type { WorkReportPeriod, WorkReportSnapshot } from '@/utils/workReport';
import { buildWorkReportHtml } from '@/utils/workReportPdf';

export function useWorkReportPdf() {
  const { t, i18n } = useTranslation();
  const busy = useRef(false);
  const [isExporting, setIsExporting] = useState(false);

  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setIsExporting(true);
    try {
      await action();
    } catch (error) {
      if (error instanceof PdfViewerUnavailableError) {
        Alert.alert(t('reports.pdf.title'), t('reports.pdf.noViewer'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('reports.pdf.share'),
            onPress: () => {
              void run(() => shareWorkReportPdf(error.uri));
            },
          },
        ]);
        return;
      }
      Alert.alert(
        t('reports.pdf.title'),
        t(
          error instanceof PdfPreviewUnavailableError
            ? 'reports.pdf.unavailable'
            : error instanceof PdfSharingUnavailableError
              ? 'reports.pdf.sharingUnavailable'
              : 'reports.pdf.error',
        ),
      );
    } finally {
      busy.current = false;
      setIsExporting(false);
    }
  }

  async function exportReport(
    report: WorkReportSnapshot,
    period: WorkReportPeriod,
  ) {
    await run(async () => {
      const html = buildWorkReportHtml({
        report,
        period,
        locale: i18n.resolvedLanguage ?? 'en',
        t,
        generatedAt: Date.now(),
      });
      await openWorkReportPdf(html);
    });
  }

  return { isExporting, exportReport };
}
