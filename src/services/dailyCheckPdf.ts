import { Directory, File, Paths } from 'expo-file-system';
import type { TFunction } from 'i18next';
import { Platform } from 'react-native';

import type { DailyCheckRecord } from '@/db/types';
import {
  openWorkReportPdf,
  PdfPreviewUnavailableError,
} from '@/services/workReportPdf';
import {
  assertDailyCheckExportable,
  buildDailyCheckHtml,
  type DailyCheckPdfPhoto,
} from '@/utils/dailyCheckPdf';

export const MAX_PDF_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PHOTOS_BYTES = 20 * 1024 * 1024;

function imageMime(base64: string): string | null {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let value = 0,
    bits = 0;
  for (const character of base64.slice(0, 24)) {
    if (character === '=') break;
    value = value * 64 + alphabet.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 255);
      value &= (1 << bits) - 1;
    }
  }
  const matches = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[index + offset] === byte);
  if (matches([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (matches([255, 216, 255])) return 'image/jpeg';
  if (matches([71, 73, 70, 56, 55, 97]) || matches([71, 73, 70, 56, 57, 97]))
    return 'image/gif';
  if (matches([82, 73, 70, 70]) && matches([87, 69, 66, 80], 8))
    return 'image/webp';
  return null;
}

export async function readDailyCheckPdfPhotos(
  record: DailyCheckRecord,
): Promise<DailyCheckPdfPhoto[]> {
  const directory = new Directory(Paths.document, 'daily-check-photos');
  const prefix = `${directory.uri.replace(/\/$/, '')}/`;
  const photos: DailyCheckPdfPhoto[] = [];
  let totalBytes = 0;
  for (const item of record.items) {
    if (!item.photo_uri) continue;
    const uri = item.photo_uri;
    const filename = uri.startsWith(prefix) ? uri.slice(prefix.length) : '';
    if (!/^[a-z\d-]+\.(jpe?g|png|webp|gif|heic|heif)$/i.test(filename)) {
      photos.push({ itemId: item.id, reason: 'missing' });
      continue;
    }
    if (/\.(heic|heif)$/i.test(filename)) {
      photos.push({ itemId: item.id, reason: 'format' });
      continue;
    }
    try {
      const file = new File(uri);
      if (!file.exists || !Number.isFinite(file.size) || file.size <= 0) {
        photos.push({ itemId: item.id, reason: 'missing' });
        continue;
      }
      if (
        file.size > MAX_PDF_PHOTO_BYTES ||
        totalBytes + file.size > MAX_PDF_PHOTOS_BYTES
      ) {
        photos.push({ itemId: item.id, reason: 'size' });
        continue;
      }
      const base64 = await file.base64();
      if (
        !base64 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
        base64.length > Math.ceil(MAX_PDF_PHOTO_BYTES / 3) * 4
      ) {
        photos.push({ itemId: item.id, reason: 'size' });
        continue;
      }
      const mimeType = imageMime(base64);
      if (!mimeType) {
        photos.push({ itemId: item.id, reason: 'format' });
        continue;
      }
      totalBytes += file.size;
      photos.push({
        itemId: item.id,
        dataUri: `data:${mimeType};base64,${base64}`,
      });
    } catch {
      photos.push({ itemId: item.id, reason: 'missing' });
    }
  }
  return photos;
}

export async function openDailyCheckPdf(
  record: DailyCheckRecord,
  options: { locale: string; t: TFunction },
): Promise<void> {
  if (Platform.OS === 'web')
    throw new PdfPreviewUnavailableError(
      'PDF preview requires the native application',
    );
  const snapshot = {
    check: { ...record.check },
    items: record.items.map((item) => ({ ...item })),
  };
  assertDailyCheckExportable(snapshot);
  const generatedAt = Date.now();
  const photos = await readDailyCheckPdfPhotos(snapshot);
  await openWorkReportPdf(
    buildDailyCheckHtml({ record: snapshot, photos, ...options, generatedAt }),
  );
}
