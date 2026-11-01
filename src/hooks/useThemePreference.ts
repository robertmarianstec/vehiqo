import { useCallback, useEffect, useRef, useState } from 'react';
import { Appearance, Platform } from 'react-native';

import { getThemePreference, setThemePreference } from '@/db/queries';
import type { ThemePreference } from '@/db/types';

export interface UseThemePreferenceReturn {
  preference: ThemePreference;
  isLoading: boolean;
  isSaving: boolean;
  loadError: boolean;
  retryLoad: () => void;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

function applyThemePreference(preference: ThemePreference): void {
  if (Platform.OS !== 'web') {
    Appearance.setColorScheme(
      preference === 'system' ? 'unspecified' : preference,
    );
  }
}

export function useThemePreference(): UseThemePreferenceReturn {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const saving = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError(false);
      try {
        const stored = await getThemePreference();
        if (!cancelled) {
          applyThemePreference(stored);
          setPreferenceState(stored);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const retryLoad = useCallback(
    () => setLoadAttempt((attempt) => attempt + 1),
    [],
  );

  const setPreference = useCallback(
    async (next: ThemePreference) => {
      if (isLoading || loadError || saving.current) return;
      saving.current = true;
      setIsSaving(true);
      try {
        await setThemePreference(next);
        applyThemePreference(next);
        setPreferenceState(next);
      } finally {
        saving.current = false;
        setIsSaving(false);
      }
    },
    [isLoading, loadError],
  );

  return {
    preference,
    isLoading,
    isSaving,
    loadError,
    retryLoad,
    setPreference,
  };
}
