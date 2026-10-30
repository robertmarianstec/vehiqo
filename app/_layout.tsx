import '../global.css';
import '@/i18n';

import { Stack } from 'expo-router';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Appearance, Platform, useColorScheme } from 'react-native';

import { getDatabase } from '@/db';
import { getThemePreference } from '@/db/queries';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const colorScheme = useColorScheme();

  useEffect(() => {
    async function prepare() {
      try {
        // getDatabase self-limits on web (the OPFS worker can hang there); on
        // native it resolves normally. Either way we never block the splash.
        await getDatabase();

        // react-native-web's Appearance is read-only — setColorScheme doesn't
        // exist there, so the web preview just follows the browser's own setting.
        if (Platform.OS !== 'web') {
          const preference = await getThemePreference();
          Appearance.setColorScheme(
            preference === 'system' ? 'unspecified' : preference,
          );
        }
      } catch (e) {
        // On web this is an expected UI-preview limitation, not a real bug —
        // console.error would trigger RN Web's on-screen LogBox overlay.
        if (Platform.OS === 'web') {
          console.info('SQLite unavailable in web preview:', e);
        } else {
          console.error('DB init failed:', e);
        }
      } finally {
        setReady(true);
        await SplashScreen.hideAsync();
      }
    }
    prepare();
  }, []);

  if (!ready) return null;

  return (
    <ThemeProvider value={colorScheme === 'light' ? DefaultTheme : DarkTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {/* The only screen outside the tabs, so it needs the stack header to
            give the driver a way back. */}
        <Stack.Screen
          name="limitations"
          options={{ headerShown: true, title: t('limitations.title') }}
        />
      </Stack>
    </ThemeProvider>
  );
}
