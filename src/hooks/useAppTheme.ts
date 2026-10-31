import {
  DarkTheme,
  DefaultTheme,
  type Theme,
} from 'expo-router/react-navigation';
import { useColorScheme } from 'react-native';

import { useThemeColor } from '@/hooks/useThemeColor';

type AppTheme = Theme & {
  colors: Theme['colors'] & { muted: Theme['colors']['text'] };
};

// Navigation needs raw colors rather than NativeWind class names.
export function useAppTheme(): AppTheme {
  const base = useColorScheme() === 'dark' ? DarkTheme : DefaultTheme;
  const primary = useThemeColor('--brand');
  const background = useThemeColor('--canvas');
  const card = useThemeColor('--surface-nav');
  const text = useThemeColor('--ink');
  const muted = useThemeColor('--ink-muted');
  const border = useThemeColor('--line');
  const notification = useThemeColor('--danger');

  return {
    ...base,
    colors: {
      primary: primary ?? base.colors.primary,
      background: background ?? base.colors.background,
      card: card ?? base.colors.card,
      text: text ?? base.colors.text,
      muted: muted ?? base.colors.text,
      border: border ?? base.colors.border,
      notification: notification ?? base.colors.notification,
    },
  };
}
