import { useColorScheme } from 'react-native';

// NativeWind's native variable hook is unavailable in the browser.
export function useThemeColor(name: string): string | undefined {
  useColorScheme();
  if (typeof document === 'undefined') return undefined;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    undefined
  );
}
