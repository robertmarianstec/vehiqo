import type { TFunction } from 'i18next';

import { getDailyCheckItemKeys, TRAILER_TYPES } from '@/constants/dailyCheck';
import type { DailyCheckRecord } from '@/db/types';
import { getDailyCheckItemTitle } from '@/utils/dailyCheck';

export type DailyCheckPdfPhoto = { itemId: string } & (
  | { dataUri: string; reason?: never }
  | { reason: 'missing' | 'size' | 'format'; dataUri?: never }
);

export function assertDailyCheckExportable(record: DailyCheckRecord): void {
  const { check, items } = record;
  const validTime = (value: number) =>
    Number.isSafeInteger(value) &&
    value >= 0 &&
    Number.isFinite(new Date(value).getTime());
  if (
    !['tractor', 'trailer'].includes(check.vehicle_type) ||
    (check.vehicle_type === 'trailer' &&
      !TRAILER_TYPES.includes(check.trailer_type!))
  )
    throw new Error('Invalid daily check vehicle');
  if (
    check.completed_at === null ||
    !validTime(check.completed_at) ||
    !validTime(check.started_at) ||
    check.completed_at < check.started_at ||
    !check.driver_name?.trim()
  )
    throw new Error('Only confirmed daily checks can be exported');
  const keys = getDailyCheckItemKeys(check.vehicle_type);
  if (
    items.length !== keys.length ||
    keys.some(
      (key) => items.filter((item) => item.item_key === key).length !== 1,
    ) ||
    new Set(items.map((item) => item.id)).size !== items.length
  )
    throw new Error('Invalid checklist items');
  if (
    items.some(
      (item) =>
        item.daily_check_id !== check.id ||
        item.checked !== 1 ||
        ![0, 1].includes(item.has_issue) ||
        ![0, 1].includes(item.is_critical) ||
        (item.is_critical && !item.has_issue),
    )
  )
    throw new Error('Invalid confirmed checklist');
}

const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function buildDailyCheckHtml({
  record,
  photos = [],
  locale,
  t,
  generatedAt,
}: {
  record: DailyCheckRecord;
  photos?: readonly DailyCheckPdfPhoto[];
  locale: string;
  t: TFunction;
  generatedAt: number;
}): string {
  assertDailyCheckExportable(record);
  if (!Number.isFinite(generatedAt) || generatedAt < record.check.completed_at!)
    throw new Error('Invalid PDF generation time');
  const { check } = record;
  const items = getDailyCheckItemKeys(check.vehicle_type).map(
    (key) => record.items.find((item) => item.item_key === key)!,
  );
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const stamp = (time: number) =>
    new Intl.DateTimeFormat(locale, {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(time);
  const label =
    escape(t(`dailyCheck.vehicles.${check.vehicle_type}`)) +
    (check.trailer_type
      ? ` - ${escape(t(`dailyCheck.trailerTypes.${check.trailer_type}`))}`
      : '');
  const rows = items
    .map(
      (item) =>
        `<tr><th scope="row">${escape(getDailyCheckItemTitle(t, check, item))}</th><td>${escape(t('dailyCheck.checked'))}</td><td>${item.has_issue ? `<strong>${escape(t(item.is_critical ? 'dailyCheck.criticalIssue' : 'dailyCheck.issue'))}</strong>` : ''}${item.note?.trim() || item.photo_uri ? `<small>${escape(t('dailyCheck.pdf.detailsBelow'))}</small>` : ''}</td></tr>`,
    )
    .join('');
  const attachments = items
    .filter((item) => item.photo_uri || item.note?.trim())
    .map((item) => {
      const photo = photos.find((photo) => photo.itemId === item.id);
      if (
        photo?.dataUri &&
        !/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          photo.dataUri,
        )
      )
        throw new Error('Invalid embedded PDF photo');
      const caption = escape(getDailyCheckItemTitle(t, check, item));
      return `<section class="observation"><h3>${caption}</h3>${item.note?.trim() ? `<p class="note">${escape(item.note)}</p>` : ''}${item.photo_uri ? `<figure><figcaption>${caption} - ${escape(t('dailyCheck.pdf.photos'))}</figcaption>${photo?.dataUri ? `<img src="${photo.dataUri}" alt="${caption}">` : `<p>${escape(t(`dailyCheck.pdf.photoOmitted.${photo?.reason ?? 'missing'}`))}</p>`}</figure>` : ''}</section>`;
    })
    .join('');
  return `<!doctype html>
<html lang="${escape(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vehiqo - ${escape(t('dailyCheck.pdf.title'))}</title>
<style>
@page { size: A4 portrait; margin: 14mm; }
body { margin: 0; font: 12pt/1.4 Arial, Helvetica, sans-serif; }
h1 { font-size: 20pt; margin: 0 0 8pt; }
h2 { font-size: 15pt; margin: 18pt 0 10pt; break-after: avoid; }
h3 { font-size: 12pt; margin: 14pt 0 6pt; break-after: avoid; }
p { margin: 5pt 0; }
.disclaimer { border: 1px solid; padding: 8pt; margin: 10pt 0; font-size: 10pt; }
.meta { margin: 12pt 0; }
.meta dt { font-weight: bold; }
.meta dd { margin: 0 0 5pt; overflow-wrap: anywhere; }
table { border-collapse: collapse; width: 100%; table-layout: fixed; }
thead { display: table-header-group; }
th, td { text-align: left; vertical-align: top; border-bottom: 1px solid; padding: 6pt 4pt; overflow-wrap: anywhere; }
thead th { font-size: 11pt; }
th:first-child { width: 34%; }
th:nth-child(2) { width: 20%; }
tbody th { font-weight: normal; }
.note { white-space: pre-wrap; overflow-wrap: anywhere; }
small { display: block; font-size: 10pt; margin-top: 4pt; }
figure { margin: 12pt 0 18pt; break-inside: avoid; page-break-inside: avoid; }
figcaption { font-weight: bold; margin-bottom: 6pt; }
img { display: block; max-width: 100%; max-height: 140mm; width: auto; height: auto; }
footer { margin-top: 16pt; font-size: 10pt; overflow-wrap: anywhere; break-inside: avoid; page-break-inside: avoid; }
</style></head><body>
<header><h1>Vehiqo - ${escape(t('dailyCheck.pdf.title'))}</h1><p>${label}</p>
<p class="disclaimer">${escape(t('dailyCheck.pdf.disclaimer'))}</p></header>
<dl class="meta"><dt>${escape(t('dailyCheck.pdf.startedAt'))}</dt><dd>${escape(stamp(check.started_at))}</dd>
<dt>${escape(t('dailyCheck.pdf.confirmedAt'))}</dt><dd>${escape(stamp(check.completed_at!))}</dd>
<dt>${escape(t('dailyCheck.confirmedBy'))}</dt><dd>${escape(check.driver_name!)}</dd></dl>
<p>${escape(t('dailyCheck.issueCount'))}: ${items.filter((item) => item.has_issue).length}. ${escape(t('dailyCheck.criticalCount'))}: ${items.filter((item) => item.is_critical).length}.</p>
<table><thead><tr><th scope="col">${escape(t('dailyCheck.pdf.item'))}</th><th scope="col">${escape(t('dailyCheck.pdf.inspection'))}</th><th scope="col">${escape(t('dailyCheck.pdf.driverMarks'))}</th></tr></thead><tbody>${rows}</tbody></table>
${attachments ? `<section><h2>${escape(t('dailyCheck.observations'))}</h2>${attachments}</section>` : ''}
<footer><p>${escape(t('dailyCheck.pdf.generatedAt', { date: stamp(generatedAt) }))}</p><p>${escape(t('dailyCheck.pdf.timeZone', { zone: timeZone }))}</p><p>${escape(t('dailyCheck.pdf.recordId', { id: check.id }))}</p></footer>
</body></html>`;
}
