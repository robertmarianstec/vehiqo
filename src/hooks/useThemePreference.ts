import { useCallback, useEffect, useState } from 'react';
import { Appearance, Platform } from 'react-native';

import { getThemePreference, setThemePreference } from '@/db/queries';
import type { ThemePreference } from '@/db/types';

export interface UseThemePreferenceReturn {
  preference: ThemePreference;
  isLoading: boolean;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

export function useThemePreference(): UseThemePreferenceReturn {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const stored = await getThemePreference();
      setPreferenceState(stored);
      setIsLoading(false);
    }
    void load();
  }, []);

  const setPreference = useCallback(async (next: ThemePreference) => {
    setPreferenceState(next);
    if (Platform.OS !== 'web') {
      Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
    }
    await setThemePreference(next);
  }, []);

  return { preference, isLoading, setPreference };
}
