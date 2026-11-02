import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { getWorkSessionsInRange } from '@/db/queries';
import {
  getWorkReportDays,
  getWorkReportRange,
  shiftWorkReportPeriod,
  type WorkReportPeriod,
  type WorkReportSnapshot,
} from '@/utils/workReport';

export function useWorkReport() {
  const [selection, setSelection] = useState(() => ({
    period: 'week' as WorkReportPeriod,
    anchor: Date.now(),
  }));
  const [snapshot, setSnapshot] = useState<WorkReportSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [clock, setClock] = useState(selection.anchor);
  const range = useMemo(
    () => getWorkReportRange(selection.anchor, selection.period),
    [selection],
  );
  // A fresh request also reloads an unchanged calendar period.
  const reload = useCallback(
    () => setSelection((previous) => ({ ...previous })),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        setIsLoading(true);
        setError(false);
        try {
          const asOf = Date.now();
          setClock(asOf);
          const sessions = await getWorkSessionsInRange(
            range.from,
            Math.min(range.to, asOf),
          );
          const days = getWorkReportDays(sessions, range.from, range.to, asOf);
          if (active) setSnapshot({ range, asOf, days });
        } catch {
          if (active) setError(true);
        } finally {
          if (active) setIsLoading(false);
        }
      }
      void load();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') reload();
      });
      return () => {
        active = false;
        subscription.remove();
      };
    }, [range, reload]),
  );

  const selectPeriod = useCallback((period: WorkReportPeriod) => {
    setSelection((previous) =>
      previous.period === period ? previous : { ...previous, period },
    );
  }, []);
  const movePeriod = useCallback((direction: -1 | 1) => {
    setSelection((previous) => {
      const anchor = shiftWorkReportPeriod(
        previous.anchor,
        previous.period,
        direction,
      );
      return anchor > Date.now() ? previous : { ...previous, anchor };
    });
  }, []);
  const report =
    snapshot?.range.from === range.from && snapshot.range.to === range.to
      ? snapshot
      : null;

  return {
    period: selection.period,
    range,
    report,
    isLoading,
    error,
    canMoveForward: range.to <= clock,
    selectPeriod,
    movePeriod,
    reload,
  };
}
