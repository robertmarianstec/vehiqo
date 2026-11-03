import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import {
  discardDailyCheckPhoto,
  pickDailyCheckPhoto,
} from '@/services/dailyCheckPhotos';

const mockCreate = jest.fn(),
  mockDelete = jest.fn(),
  mockCopy = jest.fn();
const mockPickFile = jest.fn<
  Promise<{ canceled: false; result: File } | { canceled: true; result: null }>,
  []
>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  Directory: class {
    uri: string;
    constructor(parent: string, child: string) {
      this.uri = `${parent}/${child}`;
    }
    create = mockCreate;
  },
  File: class {
    static pickFileAsync: jest.Mock<Promise<unknown>, []> = jest.fn(() =>
      mockPickFile(),
    );
    uri: string;
    exists = true;
    constructor(parent: string | { uri: string }, child?: string) {
      this.uri = child
        ? `${typeof parent === 'string' ? parent : parent.uri}/${child}`
        : String(parent);
    }
    delete = mockDelete;
  },
}));
jest.mock('@/utils/id', () => ({ generateId: () => 'photo-id' }));
beforeEach(() => {
  jest.clearAllMocks();
  mockCopy.mockResolvedValue(undefined);
  mockPickFile.mockResolvedValue({
    canceled: false,
    result: {
      uri: 'content://selected',
      name: 'photo.PNG',
      type: 'image/png',
      copy: mockCopy,
    } as unknown as File,
  });
});

it('copies the selected image into private documents before returning its URI', async () => {
  expect(await pickDailyCheckPhoto()).toBe(
    'file:///documents/daily-check-photos/photo-id.png',
  );
  expect(File.pickFileAsync).toHaveBeenCalledWith({ mimeTypes: 'image/*' });
  expect(mockCreate).toHaveBeenCalledWith({
    intermediates: true,
    idempotent: true,
  });
  expect(mockCopy).toHaveBeenCalledWith(
    expect.objectContaining({
      uri: 'file:///documents/daily-check-photos/photo-id.png',
    }),
  );
});

it('treats picker cancellation as an optional attachment', async () => {
  mockPickFile.mockResolvedValue({ canceled: true, result: null });
  expect(await pickDailyCheckPhoto()).toBeNull();
  expect(mockCreate).not.toHaveBeenCalled();
});

it('rejects non-images and cleans up an incomplete private copy', async () => {
  mockPickFile.mockResolvedValueOnce({
    canceled: false,
    result: { type: 'application/pdf' } as File,
  });
  await expect(pickDailyCheckPhoto()).rejects.toThrow('Not an image');
  expect(mockCopy).not.toHaveBeenCalled();
  mockCopy.mockRejectedValueOnce(new Error('disk full'));
  await expect(pickDailyCheckPhoto()).rejects.toThrow('disk full');
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

it('only removes generated attachment names inside the private directory', () => {
  for (const uri of [
    'file:///documents/other.jpg',
    'file:///documents/daily-check-photos/../other.jpg',
    'file:///documents/daily-check-photos/%2e%2e%2fother.jpg',
    'content://image',
    'file:///documents/daily-check-photos/sub/other.jpg',
  ])
    discardDailyCheckPhoto(uri);
  expect(mockDelete).not.toHaveBeenCalled();
  discardDailyCheckPhoto('file:///documents/daily-check-photos/photo-id.png');
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

it('does not open the native picker on web', async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  try {
    await expect(pickDailyCheckPhoto()).rejects.toThrow('native');
    expect(File.pickFileAsync).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: original,
    });
  }
});
