import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { generateId } from '@/utils/id';

export async function pickDailyCheckPhoto(): Promise<string | null> {
  if (Platform.OS === 'web')
    throw new Error('Photo selection requires the native application');
  const selection = await File.pickFileAsync({ mimeTypes: 'image/*' });
  if (selection.canceled) return null;
  const source = selection.result;
  if (source.type && !source.type.startsWith('image/'))
    throw new Error('Not an image');
  const directory = new Directory(Paths.document, 'daily-check-photos');
  directory.create({ intermediates: true, idempotent: true });
  const extension =
    /\.(jpe?g|png|webp|heic|heif|gif)$/i.exec(source.name)?.[0] ?? '.jpg';
  const target = new File(
    directory,
    `${generateId()}${extension.toLowerCase()}`,
  );
  try {
    await source.copy(target);
  } catch (error) {
    try {
      if (target.exists) target.delete();
    } catch {
      /* A failed copy must not mask the original error. */
    }
    throw error;
  }
  return target.uri;
}

export function discardDailyCheckPhoto(uri: string | null): void {
  if (!uri) return;
  const directory = new Directory(Paths.document, 'daily-check-photos');
  const prefix = `${directory.uri.replace(/\/$/, '')}/`;
  if (
    !uri.startsWith(prefix) ||
    !/^[a-z\d-]+\.(jpe?g|png|webp|heic|heif|gif)$/i.test(
      uri.slice(prefix.length),
    )
  )
    return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    /* An unreferenced attachment can be removed on a later cleanup. */
  }
}
