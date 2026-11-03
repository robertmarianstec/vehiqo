import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  changeDailyCheckTrailerType,
  completeDailyCheck,
  getDailyCheckDriverName,
  getOrCreateDailyCheck,
  updateDailyCheckItem,
} from '@/db/dailyChecks';
import type {
  DailyCheckItemPatch,
  DailyCheckRecord,
  TrailerType,
  VehicleType,
} from '@/db/types';
import {
  discardDailyCheckPhoto,
  pickDailyCheckPhoto,
} from '@/services/dailyCheckPhotos';

export function useDailyCheck() {
  const [record, setRecord] = useState<DailyCheckRecord | null>(null);
  const [vehicle, setVehicle] = useState<VehicleType>('tractor');
  const [driverName, setDriverName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const current = useRef<DailyCheckRecord | null>(null);
  const pending = useRef(new Map<string, DailyCheckItemPatch>());
  const writing = useRef<Promise<boolean> | null>(null);
  const failed = useRef(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const selectedVehicle = useRef<VehicleType>('tractor');

  function publish(next: DailyCheckRecord) {
    current.current = next;
    if (alive.current) setRecord(next);
  }

  function flush(retry = false): Promise<boolean> {
    if (writing.current) return writing.current;
    if (failed.current && !retry) return Promise.resolve(false);
    if (!pending.current.size) return Promise.resolve(true);
    failed.current = false;
    if (alive.current) {
      setSaveError(false);
      setIsSaving(true);
    }
    const checkId = current.current!.check.id;
    writing.current = (async () => {
      try {
        while (pending.current.size) {
          const [itemId, patch] = pending.current.entries().next().value!;
          pending.current.delete(itemId);
          try {
            const saved = await updateDailyCheckItem(checkId, itemId, patch);
            if (!pending.current.size) publish(saved);
          } catch {
            // Keep newer typing while retaining every field from the failed write.
            const latest = pending.current.get(itemId);
            pending.current.delete(itemId);
            pending.current = new Map([
              [itemId, { ...patch, ...latest }],
              ...pending.current,
            ]);
            failed.current = true;
            if (alive.current) setSaveError(true);
            return false;
          }
        }
        return true;
      } finally {
        writing.current = null;
        if (alive.current) setIsSaving(false);
      }
    })();
    return writing.current;
  }

  function editItem(itemId: string, patch: DailyCheckItemPatch) {
    const value = current.current;
    if (
      !value ||
      value.check.completed_at !== null ||
      busy.current ||
      failed.current
    )
      return;
    const item = value.items.find((item) => item.id === itemId);
    if (!item) return;
    const changes = {
      ...patch,
      ...(patch.has_issue === 0 ? { is_critical: 0 as const } : {}),
    };
    publish({
      ...value,
      items: value.items.map((item) =>
        item.id === itemId ? { ...item, ...changes } : item,
      ),
    });
    pending.current.set(itemId, { ...pending.current.get(itemId), ...changes });
    void flush();
  }

  async function transition(action: () => Promise<void>) {
    if (busy.current) return false;
    busy.current = true;
    if (alive.current) setIsBusy(true);
    try {
      if (!(await flush())) return false;
      await action();
      return true;
    } finally {
      busy.current = false;
      if (alive.current) setIsBusy(false);
    }
  }

  async function selectVehicle(nextVehicle: VehicleType, forceNew = false) {
    try {
      return await transition(async () => {
        selectedVehicle.current = nextVehicle;
        if (alive.current) {
          setVehicle(nextVehicle);
          setIsLoading(true);
          setLoadError(false);
          setPhotoError(false);
          setActionError(false);
        }
        const next = await getOrCreateDailyCheck(nextVehicle, forceNew);
        const name = await getDailyCheckDriverName();
        publish(next);
        if (alive.current) setDriverName(next.check.driver_name ?? name);
      });
    } catch {
      if (alive.current) setLoadError(true);
      return false;
    } finally {
      if (alive.current) setIsLoading(false);
    }
  }

  async function setTrailerType(value: TrailerType) {
    if (alive.current) setActionError(false);
    try {
      return await transition(async () => {
        publish(
          await changeDailyCheckTrailerType(current.current!.check.id, value),
        );
      });
    } catch {
      if (alive.current) setActionError(true);
      return false;
    }
  }

  async function finish(name: string, confirmed: boolean) {
    if (alive.current) setActionError(false);
    try {
      return await transition(async () => {
        publish(
          await completeDailyCheck(current.current!.check.id, name, confirmed),
        );
      });
    } catch {
      if (alive.current) setActionError(true);
      return false;
    }
  }

  async function changePhoto(itemId: string, remove = false) {
    let copied: string | null = null;
    try {
      return await transition(async () => {
        if (alive.current) setPhotoError(false);
        const before = current.current!;
        const oldUri =
          before.items.find((item) => item.id === itemId)?.photo_uri ?? null;
        copied = remove ? null : await pickDailyCheckPhoto();
        if (!remove && !copied) return;
        const saved = await updateDailyCheckItem(before.check.id, itemId, {
          photo_uri: copied,
        });
        publish(saved);
        copied = null;
        discardDailyCheckPhoto(oldUri);
      });
    } catch {
      discardDailyCheckPhoto(copied);
      if (alive.current) setPhotoError(true);
      return false;
    }
  }

  const selectCurrent = useRef(selectVehicle);
  useEffect(() => {
    alive.current = true;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active')
        void selectCurrent.current(selectedVehicle.current);
    });
    return () => {
      alive.current = false;
      subscription.remove();
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      void selectCurrent.current(selectedVehicle.current);
    }, []),
  );

  return {
    record,
    vehicle,
    driverName,
    isLoading,
    loadError,
    saveError,
    photoError,
    actionError,
    isSaving,
    isBusy,
    editItem,
    selectVehicle,
    setTrailerType,
    finish,
    changePhoto,
    flush,
    retrySave: () => flush(true),
    retryLoad: () => selectVehicle(vehicle),
    startNew: () => selectVehicle(vehicle, true),
  };
}
