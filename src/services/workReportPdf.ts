import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export class PdfSharingUnavailableError extends Error {}
export class PdfPreviewUnavailableError extends Error {}

export class PdfViewerUnavailableError extends Error {
  constructor(readonly uri: string) {
    super('No PDF viewer is available');
  }
}

export async function openWorkReportPdf(html: string): Promise<void> {
  // Expo's web implementation prints the current app page instead of this HTML.
  if (Platform.OS === 'web') {
    throw new PdfPreviewUnavailableError('PDF preview is unavailable');
  }
  const result = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    base64: Platform.OS === 'android',
  });
  let uri = result.uri;
  if (Platform.OS === 'android') {
    // Expo Go cannot expose Android Print files outside the project's scoped cache.
    if (!result.base64) throw new Error('Missing PDF data');
    const file = new File(Paths.cache, Paths.basename(result.uri));
    await file.write(result.base64, { encoding: 'base64' });
    uri = file.uri;
  }
  const file = new File(uri);
  const options = { mimeType: 'application/pdf' };
  if (!(await file.canPreview(options))) {
    throw new PdfViewerUnavailableError(uri);
  }
  await file.preview(options);
}

export async function shareWorkReportPdf(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new PdfSharingUnavailableError('PDF sharing is unavailable');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });
}
