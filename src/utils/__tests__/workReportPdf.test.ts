import { createInstance } from 'i18next';

import en from '@/i18n/locales/en.json';
import pl from '@/i18n/locales/pl.json';
import { getWorkReportDays, getWorkReportRange } from '@/utils/workReport';
import { buildWorkReportHtml } from '@/utils/workReportPdf';

const HOUR = 3_600_000;
const asOf = new Date(2026, 9, 31, 12).getTime();
const range = getWorkReportRange(asOf, 'month');
const history = [
  {
    id: 'drive',
    mode: 'driving' as const,
    started_at: new Date(2026, 9, 25).getTime(),
    ended_at: new Date(2026, 9, 26).getTime(),
    created_at: 0,
    updated_at: 0,
    synced_at: null,
  },
];
const report = {
  range,
  asOf,
  days: getWorkReportDays(history, range.from, range.to, asOf),
};
const translations = createInstance();

beforeAll(async () => {
  await translations.init({
    lng: 'pl',
    resources: { pl: { translation: pl }, en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});

function document(language = 'pl') {
  return buildWorkReportHtml({
    report,
    period: 'month',
    locale: language,
    t: translations.getFixedT(language),
    generatedAt: asOf + HOUR,
  });
}

it('includes all calendar rows, five modes, missing time, totals and snapshot metadata', () => {
  const html = document();
  expect(html.match(/scope="row"/g)).toHaveLength(31);
  for (const mode of Object.values(pl.workTimer.modes))
    expect(html).toContain(mode);
  expect(html).toContain('25:00');
  expect(html).toContain('708:00');
  expect(html).toContain('Europe/Warsaw');
  expect(html).toContain('12:00');
  expect(html).toContain('13:00');
  expect(html).toContain(pl.reports.disclaimer);
  expect(html).toContain(pl.reports.pdf.durationNote);
  expect(html).toContain('31.10');
  expect(html).toContain('Dane do 12:00');
  expect(html).toContain('Długość dnia: 25:00');
  expect(html).not.toMatch(/<(script|img|link)\b/i);
});

it('uses English labels without changing the recorded durations', () => {
  const html = document('en');
  expect(html).toContain('<html lang="en">');
  expect(html).toContain(en.reports.disclaimer.replace(/'/g, '&#39;'));
  expect(html).toContain(en.workTimer.modes.standby);
  expect(html).toContain('25:00');
  expect(html).not.toContain(pl.workTimer.modes.driving);
});

it('escapes translated text before placing it in HTML', () => {
  translations.addResource(
    'pl',
    'translation',
    'reports.pdf.title',
    '<img src=x onerror="alert(1)"> & test',
  );
  try {
    const html = document();
    expect(html).toContain(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; test',
    );
    expect(html).not.toContain('<img');
  } finally {
    translations.addResource(
      'pl',
      'translation',
      'reports.pdf.title',
      pl.reports.pdf.title,
    );
  }
});

it('marks the 23-hour day and excludes future dates from a current week', () => {
  const now = new Date(2026, 2, 29, 12).getTime();
  const selected = getWorkReportRange(now, 'week');
  const html = buildWorkReportHtml({
    report: {
      range: selected,
      asOf: now,
      days: getWorkReportDays([], selected.from, selected.to, now),
    },
    period: 'week',
    locale: 'pl',
    t: translations.getFixedT('pl'),
    generatedAt: now,
  });
  expect(html.match(/scope="row"/g)).toHaveLength(7);
  expect(html).toContain('Długość dnia: 23:00');
  expect(html).toContain('Dane do 12:00');
  expect(html).not.toContain('30.03');
});
