import { useNativeVariable } from 'react-native-css/native';

export function useThemeColor(name: string): string | undefined {
  const value = useNativeVariable(name);
  return typeof value === 'string' ? value : undefined;
}
