import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getFatigueSnapshot, saveFatigueAction } from '@/db/fatigue';
import type { FatigueAction, FatigueSnapshot } from '@/db/types';
import { FatigueError, type FatigueErrorCode } from '@/utils/fatigue';

export function useFatigue() {
  const [snapshot, setSnapshot] = useState<FatigueSnapshot | null>(null);
  const [now, setNow] = useState(Date.now);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadDetails, setLoadDetails] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<
    FatigueErrorCode | 'saveFailed' | null
  >(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const request = useRef(0);
  const current = useRef<FatigueSnapshot | null>(null);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    const id = ++request.current;
    setIsLoading(true);
    setLoadError(false);
    setLoadDetails(null);
    try {
      const next = await getFatigueSnapshot();
      if (alive.current && id === request.current) {
        current.current = next;
        setSnapshot(next);
        setNow(Date.now());
      }
    } catch (error) {
      if (alive.current && id === request.current) {
        setLoadError(true);
        if (__DEV__)
          setLoadDetails(
            error instanceof Error ? error.message : String(error),
          );
      }
    } finally {
      if (alive.current && id === request.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      alive.current = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [refresh]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function save(
    action: FatigueAction,
    revision: number,
    generation: string | null,
  ): Promise<boolean> {
    if (busy.current || !current.current) return false;
    busy.current = true;
    ++request.current;
    setIsSaving(true);
    setSaveError(null);
    try {
      const next = await saveFatigueAction(action, revision, generation);
      current.current = next;
      if (alive.current) {
        setSnapshot(next);
        setNow(Date.now());
        setLoadError(false);
      }
      return true;
    } catch (error) {
      if (alive.current)
        setSaveError(error instanceof FatigueError ? error.code : 'saveFailed');
      return false;
    } finally {
      busy.current = false;
      if (alive.current) {
        setIsSaving(false);
        setIsLoading(false);
      }
    }
  }

  return {
    snapshot,
    now,
    isLoading,
    isSaving,
    loadError,
    loadDetails,
    saveError,
    clockError: snapshot !== null && now < snapshot.updatedAt,
    refresh,
    save,
    clearSaveError: () => setSaveError(null),
  };
}
