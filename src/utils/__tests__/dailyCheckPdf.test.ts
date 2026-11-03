import { createInstance } from 'i18next';

import en from '@/i18n/locales/en.json';
import pl from '@/i18n/locales/pl.json';
import { CHECK_CONFIRMED_AT, dailyCheckFixture } from '@/test/dailyCheck';
import {
  assertDailyCheckExportable,
  buildDailyCheckHtml,
  type DailyCheckPdfPhoto,
} from '@/utils/dailyCheckPdf';

const translations = createInstance();
beforeAll(async () => {
  await translations.init({
    resources: { pl: { translation: pl }, en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});
function document(
  record = dailyCheckFixture(),
  locale = 'pl',
  photos: DailyCheckPdfPhoto[] = [],
) {
  return buildDailyCheckHtml({
    record,
    photos,
    locale,
    t: translations.getFixedT(locale),
    generatedAt: CHECK_CONFIRMED_AT + 60_000,
  });
}

it('exports all inspected items and distinct confirmation/generation metadata without legacy sensitive fields', () => {
  const record = dailyCheckFixture();
  record.check.gps_lat = 50;
  record.check.signature_uri = 'SECRET-SIGNATURE';
  record.items[0].has_issue = 1;
  record.items[0].is_critical = 1;
  record.items[0].note = 'Opona - ciśnienie 8,5 bar.\nSprawdzono ponownie.';
  const html = document(record);
  expect(html.match(/scope="row"/g)).toHaveLength(7);
  expect(html).toContain('Anna Testowa');
  expect(html).toContain('07:20');
  expect(html).toContain('07:35');
  expect(html).toContain('07:36');
  expect(html).toContain('Europe/Warsaw');
  expect(html).toContain(pl.dailyCheck.criticalIssue);
  expect(html).toContain('Opona - ciśnienie 8,5 bar.\nSprawdzono ponownie.');
  expect(html).toContain(pl.dailyCheck.pdf.disclaimer);
  expect(html).not.toContain('SECRET-SIGNATURE');
  expect(html).not.toContain('gps_lat');
  expect(html).not.toMatch(/<(script|link)\b|https?:\/\//i);
});

it('escapes driver and note content instead of executing or fetching it', () => {
  const record = dailyCheckFixture();
  record.check.driver_name = '<img src=x> & "Jan"';
  record.items[0].note = '<script>alert(1)</script> & test';
  const html = document(record);
  expect(html).toContain('&lt;img src=x&gt; &amp; &quot;Jan&quot;');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; test');
  expect(html).not.toMatch(/<(script|img)\b/i);
});

it('uses English trailer-specific labels and preserves the recorded name', () => {
  const record = dailyCheckFixture('trailer');
  const html = document(record, 'en');
  expect(html.match(/scope="row"/g)).toHaveLength(6);
  expect(html).toContain(en.dailyCheck.trailerItems.body.fridge);
  expect(html).toContain(en.dailyCheck.trailerItems.lights);
  expect(html).toContain(en.dailyCheck.trailerTypes.fridge);
  expect(html).toContain('Anna Testowa');
  expect(html).not.toContain(pl.dailyCheck.checked);
});

it('embeds supported photos and never exports the private source URI', () => {
  const record = dailyCheckFixture();
  record.items[0].photo_uri = 'file:///private/daily-check-photos/photo.png';
  const html = document(record, 'pl', [
    { itemId: record.items[0].id, dataUri: 'data:image/png;base64,aGVsbG8=' },
  ]);
  expect(html).toContain('<img src="data:image/png;base64,aGVsbG8="');
  expect(html).not.toContain('file:///');
  expect(html).toContain(pl.dailyCheck.pdf.photos);
  expect(() =>
    document(record, 'pl', [
      { itemId: record.items[0].id, dataUri: 'https://example.com/photo.png' },
    ]),
  ).toThrow('Invalid embedded');
});

it.each(['missing', 'size', 'format'] as const)(
  'records why the %s photo is absent without dropping the checklist',
  (reason) => {
    const record = dailyCheckFixture();
    record.items[0].photo_uri = 'file:///private/photo.jpg';
    const html = document(record, 'pl', [
      { itemId: record.items[0].id, reason },
    ]);
    expect(html).toContain(pl.dailyCheck.pdf.photoOmitted[reason]);
    expect(html).not.toContain('<img');
    expect(html.match(/scope="row"/g)).toHaveLength(7);
  },
);

it('shows the missing-photo explanation when no attachment was supplied', () => {
  const record = dailyCheckFixture();
  record.items[0].photo_uri = 'file:///private/photo.jpg';
  expect(document(record)).toContain(pl.dailyCheck.pdf.photoOmitted.missing);
});

it('rejects drafts, incomplete lists, mismatched IDs, duplicate items and invalid confirmations', () => {
  const draft = dailyCheckFixture();
  draft.check.completed_at = null;
  expect(() => document(draft)).toThrow('confirmed');
  const unchecked = dailyCheckFixture();
  unchecked.items[0].checked = 0;
  expect(() => document(unchecked)).toThrow('confirmed');
  const nameless = dailyCheckFixture();
  nameless.check.driver_name = '  ';
  expect(() => document(nameless)).toThrow('confirmed');
  const duplicate = dailyCheckFixture();
  duplicate.items[0] = { ...duplicate.items[1] };
  expect(() => document(duplicate)).toThrow('items');
  const crossCheck = dailyCheckFixture();
  crossCheck.items[0].daily_check_id = 'another';
  expect(() => assertDailyCheckExportable(crossCheck)).toThrow('confirmed');
});
