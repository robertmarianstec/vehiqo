import type { TFunction } from 'i18next';

import { getDayBounds } from '@/utils/dayTimeline';
import { formatDuration } from '@/utils/format';
import {
  getWorkReportTotals,
  type WorkReportPeriod,
  type WorkReportSnapshot,
} from '@/utils/workReport';

const MODES = ['driving', 'other_work', 'standby', 'break', 'rest'] as const;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildWorkReportHtml({
  report,
  period,
  locale,
  t,
  generatedAt,
}: {
  report: WorkReportSnapshot;
  period: WorkReportPeriod;
  locale: string;
  t: TFunction;
  generatedAt: number;
}): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = (time: number, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(time);
  const fullDate = (time: number) =>
    date(time, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const stamp = (time: number) =>
    date(time, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  const totals = getWorkReportTotals(report.days);
  const cells = (values: typeof totals) =>
    [...MODES.map((mode) => values.durations[mode]), values.unrecorded]
      .map((value) => `<td>${formatDuration(value)}</td>`)
      .join('');
  const rows = report.days
    .map((day) => {
      const dayEnd = getDayBounds(day.dayStart).dayEnd;
      const notes: string[] = [];
      if (day.to < dayEnd)
        notes.push(
          t('reports.partialDay', {
            time: date(day.to, { hour: '2-digit', minute: '2-digit' }),
          }),
        );
      if (dayEnd - day.dayStart !== 86_400_000)
        notes.push(
          t('reports.dayLength', {
            time: formatDuration(dayEnd - day.dayStart),
          }),
        );
      return `<tr><th scope="row">${escapeHtml(date(day.dayStart, { day: '2-digit', month: '2-digit' }))}${notes.map((note) => `<small>${escapeHtml(note)}</small>`).join('')}</th>${cells(day)}</tr>`;
    })
    .join('');

  // The print document is self-contained; no fonts, assets or network requests are needed.
  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vehiqo - ${escapeHtml(t('reports.pdf.title'))}</title>
<style>
@page { size: A4 portrait; margin: 12mm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 12pt; line-height: 1.4; margin: 0; }
h1 { font-size: 20pt; margin: 0 0 6px; }
p { margin: 6px 0; }
header { margin-bottom: 16px; }
.disclaimer { border: 1px solid; padding: 8px; }
table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 12pt; }
th, td { padding: 2px 4px; border-bottom: 1px solid; text-align: right; vertical-align: top; }
th:first-child { width: 16%; text-align: left; }
thead { display: table-header-group; }
thead th { vertical-align: bottom; font-size: 11pt; overflow-wrap: break-word; }
tfoot { display: table-row-group; font-weight: bold; }
tr { break-inside: avoid; page-break-inside: avoid; }
small { display: block; font-size: 10pt; font-weight: normal; }
footer { margin-top: 12px; }
</style></head><body>
<header><h1>Vehiqo - ${escapeHtml(t('reports.pdf.title'))}</h1>
<p>${escapeHtml(t(`reports.period.${period}`))}: ${escapeHtml(fullDate(report.range.from))} - ${escapeHtml(fullDate(report.range.to - 1))}</p>
<p class="disclaimer">${escapeHtml(t('reports.disclaimer'))} ${escapeHtml(t('reports.pdf.sourceNote'))}</p>
<p>${escapeHtml(t('reports.asOf', { date: stamp(report.asOf) }))}<br>
${escapeHtml(t('reports.pdf.generatedAt', { date: stamp(generatedAt) }))}<br>
${escapeHtml(t('reports.pdf.timeZone', { zone: timeZone }))}</p></header>
<table><thead><tr><th scope="col">${escapeHtml(t('reports.pdf.date'))}</th>${MODES.map((mode) => `<th scope="col">${escapeHtml(t(`workTimer.modes.${mode}`))}</th>`).join('')}<th scope="col">${escapeHtml(t('reports.unrecorded'))}</th></tr></thead>
<tbody>${rows}</tbody><tfoot><tr><th>${escapeHtml(t('reports.pdf.total'))}</th>${cells(totals)}</tr></tfoot></table>
<footer><p>${escapeHtml(t('reports.pdf.durationNote'))}</p><p>${escapeHtml(t('reports.pdf.missingNote'))}</p></footer>
</body></html>`;
}
