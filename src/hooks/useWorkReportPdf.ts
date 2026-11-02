import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import {
  PdfSharingUnavailableError,
  shareWorkReportPdf,
} from '@/services/workReportPdf';
import type { WorkReportPeriod, WorkReportSnapshot } from '@/utils/workReport';
import { buildWorkReportHtml } from '@/utils/workReportPdf';

export function useWorkReportPdf() {
  const { t, i18n } = useTranslation();
  const busy = useRef(false);
  const [isExporting, setIsExporting] = useState(false);

  async function exportReport(
    report: WorkReportSnapshot,
    period: WorkReportPeriod,
  ) {
    if (busy.current) return;
    busy.current = true;
    setIsExporting(true);
    try {
      const html = buildWorkReportHtml({
        report,
        period,
        locale: i18n.resolvedLanguage ?? 'en',
        t,
        generatedAt: Date.now(),
      });
      await shareWorkReportPdf(html);
    } catch (error) {
      Alert.alert(
        t('reports.pdf.title'),
        t(
          error instanceof PdfSharingUnavailableError
            ? 'reports.pdf.unavailable'
            : 'reports.pdf.error',
        ),
      );
    } finally {
      busy.current = false;
      setIsExporting(false);
    }
  }

  return { isExporting, exportReport };
}
