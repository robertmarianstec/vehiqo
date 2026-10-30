describe('native styling compatibility', () => {
  it('preserves the native component registry required by Expo Router', () => {
    const native =
      jest.requireActual<typeof import('react-native')>('react-native');
    const styled = jest.requireActual<typeof import('react-native')>(
      'react-native-css/components',
    );

    expect(typeof native.NativeComponentRegistry.get).toBe('function');
    expect(styled.NativeComponentRegistry).toBe(native.NativeComponentRegistry);
  });

  it('preserves the asset registry required to load Expo fonts', () => {
    const native =
      jest.requireActual<typeof import('react-native')>('react-native');
    const styled = jest.requireActual<typeof import('react-native')>(
      'react-native-css/components',
    );

    expect(typeof native.AssetRegistry.getAssetByID).toBe('function');
    expect(styled.AssetRegistry).toBe(native.AssetRegistry);
  });
});
