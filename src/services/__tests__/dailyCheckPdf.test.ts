import { Platform } from 'react-native';

import i18n from '@/i18n';
import {
  MAX_PDF_PHOTO_BYTES,
  openDailyCheckPdf,
  readDailyCheckPdfPhotos,
} from '@/services/dailyCheckPdf';
import { openWorkReportPdf } from '@/services/workReportPdf';
import { CHECK_CONFIRMED_AT, dailyCheckFixture } from '@/test/dailyCheck';

const mockRead = jest.fn<Promise<string>, [string]>();
const mockFiles = new Map<string, { exists: boolean; size: number }>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  Directory: class {
    uri: string;
    constructor(parent: string, child: string) {
      this.uri = `${parent}/${child}`;
    }
  },
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return mockFiles.get(this.uri)?.exists ?? false;
    }
    get size() {
      return mockFiles.get(this.uri)?.size ?? 0;
    }
    base64() {
      return mockRead(this.uri);
    }
  },
}));
jest.mock('@/services/workReportPdf', () => ({
  openWorkReportPdf: jest.fn(),
  PdfPreviewUnavailableError: class extends Error {},
}));
const originalPlatform = Platform.OS;
beforeEach(async () => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockRead.mockReset().mockResolvedValue('iVBORw0KGgo=');
  jest.useFakeTimers();
  jest.setSystemTime(CHECK_CONFIRMED_AT + 60_000);
  await i18n.changeLanguage('pl');
});
afterEach(() => {
  jest.useRealTimers();
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: originalPlatform,
  });
});
function attached(count = 1, size = 100) {
  const record = dailyCheckFixture();
  for (let index = 0; index < count; index++) {
    const uri = `file:///documents/daily-check-photos/photo-${index}.png`;
    record.items[index].photo_uri = uri;
    mockFiles.set(uri, { exists: true, size });
  }
  return record;
}

it('reads only local private images and supplies a self-contained document to the existing PDF preview', async () => {
  const record = attached();
  await openDailyCheckPdf(record, { locale: 'pl', t: i18n.t.bind(i18n) });
  expect(mockRead).toHaveBeenCalledTimes(1);
  expect(openWorkReportPdf).toHaveBeenCalledWith(
    expect.stringContaining('data:image/png;base64,iVBORw0KGgo='),
  );
  expect(jest.mocked(openWorkReportPdf).mock.calls[0][0]).not.toContain(
    'file:///documents',
  );
});

it('does not read remote or traversing paths and explicitly records unavailable files', async () => {
  const record = dailyCheckFixture();
  record.items[0].photo_uri = 'https://example.com/photo.jpg';
  record.items[1].photo_uri =
    'file:///documents/daily-check-photos/../secret.png';
  record.items[2].photo_uri =
    'file:///documents/daily-check-photos/missing.png';
  expect(await readDailyCheckPdfPhotos(record)).toEqual(
    record.items
      .slice(0, 3)
      .map((item) => ({ itemId: item.id, reason: 'missing' })),
  );
  expect(mockRead).not.toHaveBeenCalled();
});

it.each([
  ['image/jpeg', '/9j/'],
  ['image/png', 'iVBORw0KGgo='],
  ['image/gif', 'R0lGODlh'],
  ['image/webp', 'UklGRjAwMDBXRUJQ'],
])(
  'detects %s from the image header instead of trusting the filename',
  async (mime, base64) => {
    mockRead.mockResolvedValue(base64);
    const photos = await readDailyCheckPdfPhotos(attached());
    expect(photos[0]).toMatchObject({
      dataUri: `data:${mime};base64,${base64}`,
    });
  },
);

it('describes an unsupported image instead of placing a broken image in the PDF', async () => {
  mockRead.mockResolvedValue('aGVsbG8=');
  expect(await readDailyCheckPdfPhotos(attached())).toEqual([
    { itemId: 'item-0', reason: 'format' },
  ]);
});

it('limits per-photo and total size before allocating base64 data', async () => {
  expect(
    await readDailyCheckPdfPhotos(attached(1, MAX_PDF_PHOTO_BYTES + 1)),
  ).toEqual([{ itemId: 'item-0', reason: 'size' }]);
  expect(mockRead).not.toHaveBeenCalled();
  const photos = await readDailyCheckPdfPhotos(
    attached(3, MAX_PDF_PHOTO_BYTES),
  );
  expect(photos[2]).toEqual({ itemId: 'item-2', reason: 'size' });
  expect(mockRead).toHaveBeenCalledTimes(2);
});

it('marks unreadable and unsupported images instead of aborting an otherwise valid export', async () => {
  const record = attached(2);
  record.items[1].photo_uri = 'file:///documents/daily-check-photos/photo.heic';
  mockRead.mockRejectedValue(new Error('file removed'));
  expect(await readDailyCheckPdfPhotos(record)).toEqual([
    { itemId: 'item-0', reason: 'missing' },
    { itemId: 'item-1', reason: 'format' },
  ]);
});

it('keeps a snapshot while attachments are read asynchronously', async () => {
  const record = attached();
  let finish!: (value: string) => void;
  mockRead.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const exporting = openDailyCheckPdf(record, {
    locale: 'pl',
    t: i18n.t.bind(i18n),
  });
  record.check.driver_name = 'CHANGED';
  record.items[0].note = 'CHANGED';
  finish('iVBORw0KGgo=');
  await exporting;
  const html = jest.mocked(openWorkReportPdf).mock.calls[0][0];
  expect(html).toContain('Anna Testowa');
  expect(html).not.toContain('CHANGED');
});

it('rejects a draft before reading photos or opening a viewer', async () => {
  const record = attached();
  record.check.completed_at = null;
  await expect(
    openDailyCheckPdf(record, { locale: 'pl', t: i18n.t.bind(i18n) }),
  ).rejects.toThrow('confirmed');
  expect(mockRead).not.toHaveBeenCalled();
  expect(openWorkReportPdf).not.toHaveBeenCalled();
});

it('does not print the browser app as a substitute for an inspection PDF', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  await expect(
    openDailyCheckPdf(attached(), { locale: 'pl', t: i18n.t.bind(i18n) }),
  ).rejects.toThrow('native');
  expect(mockRead).not.toHaveBeenCalled();
  expect(openWorkReportPdf).not.toHaveBeenCalled();
});
