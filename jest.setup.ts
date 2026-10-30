// Jest has no native font files. Keep real icon glyphs without loading the
// numeric asset IDs supplied by the React Native test preset.
jest.mock('expo-font', () => ({
  ...jest.requireActual<typeof import('expo-font')>('expo-font'),
  isLoaded: jest.fn(() => true),
}));
