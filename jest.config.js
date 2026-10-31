// Keep daylight-saving regression tests independent of the host timezone.
process.env.TZ = 'Europe/Warsaw';

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  modulePathIgnorePatterns: ['<rootDir>/\\.expo/'],
  moduleNameMapper: {
    '^expo-modules-core$': require.resolve('expo-modules-core', {
      paths: [require.resolve('expo/package.json')],
    }),
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
