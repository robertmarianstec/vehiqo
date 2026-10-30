# React Native CSS compatibility

`react-native-css@3.1.0-rc.0` forwards `NativeComponentRegistry`, required by
Expo Router on SDK 58, but omits React Native's public `AssetRegistry` export.
Its global component replacement also affects Expo's asset and font loaders.

The patch forwards `AssetRegistry` in both published module formats and the
source entry. `postinstall` reapplies it and fails if it cannot be applied.
The regression tests cover both registries. Remove the patch when an upstream
release provides the missing export and those tests pass without it.
