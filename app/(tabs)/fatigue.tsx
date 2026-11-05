import { type ComponentRef, type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { Card, ScreenContainer, Text } from '@/components';
import {
  readSleepTime,
  SleepDateTimeField,
  type SleepTimeInput,
  sleepTimeInput,
} from '@/components/SleepDateTimeField';
import { SCHEMA_VERSION } from '@/db/schema';
import type { FatigueAction } from '@/db/types';
import { useFatigue } from '@/hooks/useFatigue';
import {
  FatigueError,
  type FatigueErrorCode,
  getSleepHistory,
} from '@/utils/fatigue';
import { formatDuration } from '@/utils/format';

function Action({
  children,
  onPress,
  disabled = false,
  primary = false,
  selected,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  selected?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{
        disabled,
        ...(selected === undefined ? {} : { selected }),
      }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 items-center justify-center rounded-xl border px-4 py-3 ${primary && !disabled ? 'border-brand bg-brand' : selected ? 'border-brand bg-info-surface' : 'border-line-control bg-surface-control'}`}
    >
      <Text
        className={`text-center font-semibold ${primary && !disabled ? 'text-on-brand' : disabled ? 'text-ink-muted' : 'text-ink'}`}
      >
        {children}
      </Text>
    </TouchableOpacity>
  );
}

type Form = {
  type: FatigueAction['type'];
  revision: number;
  generation: string | null;
  useNow: boolean;
  from: SleepTimeInput;
  to: SleepTimeInput;
};

export default function FatigueScreen() {
  const { t, i18n } = useTranslation();
  const model = useFatigue();
  const { snapshot, now, isLoading, isSaving, loadError, clockError } = model;
  const { width, height } = useWindowDimensions();
  const landscape = width > height && width >= 640;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [validation, setValidation] = useState<FatigueErrorCode | null>(null);
  const [feedback, setFeedback] = useState<
    'wakeSaved' | 'sleepSaved' | 'pastSaved' | null
  >(null);
  const open = snapshot?.entries.find((entry) => entry.woke_at === null);
  const history = snapshot ? getSleepHistory(snapshot.entries, now) : [];
  const error = validation ?? model.saveError;
  const disabled = isSaving || isLoading || clockError || loadError;
  const formatDate = (value: number, time = false) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(time ? ({ hour: '2-digit', minute: '2-digit' } as const) : {}),
    }).format(value);
  const clock = (value: number) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(value);

  function start(type: Form['type']) {
    if (!snapshot || disabled) return;
    const initial = sleepTimeInput(
      type === 'correctWake' ? snapshot.wokeAt! : Date.now(),
    );
    setForm({
      type,
      revision: snapshot.revision,
      generation: snapshot.generation,
      useNow: type !== 'correctWake' && type !== 'addSleep',
      from: { date: initial.date, time: '', occurrence: null },
      to:
        type === 'addSleep'
          ? { date: initial.date, time: '', occurrence: null }
          : initial,
    });
    setValidation(null);
    setFeedback(null);
    model.clearSaveError();
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function update(patch: Partial<Form>) {
    setForm((value) => (value ? { ...value, ...patch } : null));
    setValidation(null);
    model.clearSaveError();
  }
  function cancel() {
    if (isSaving) return;
    setForm(null);
    setValidation(null);
    model.clearSaveError();
    Keyboard.dismiss();
  }
  async function save() {
    if (!form || disabled) return;
    setValidation(null);
    try {
      const action: FatigueAction =
        form.type === 'addSleep'
          ? {
              type: 'addSleep',
              from: readSleepTime(form.from),
              to: readSleepTime(form.to),
            }
          : {
              type: form.type,
              at: form.useNow ? Date.now() : readSleepTime(form.to),
            };
      if (await model.save(action, form.revision, form.generation)) {
        setFeedback(
          form.type === 'sleep'
            ? 'sleepSaved'
            : form.type === 'addSleep'
              ? 'pastSaved'
              : 'wakeSaved',
        );
        setForm(null);
        Keyboard.dismiss();
      }
    } catch (cause) {
      setValidation(cause instanceof FatigueError ? cause.code : 'invalidTime');
    }
  }
  const formTitle =
    form?.type === 'sleep'
      ? t('fatigue.sleepTime')
      : form?.type === 'correctWake'
        ? t('fatigue.correctWake')
        : form?.type === 'addSleep'
          ? t('fatigue.pastSleep')
          : t('fatigue.recordWake');

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-4 px-4 py-4"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <View className="gap-1">
            <Text variant="heading">{t('fatigue.title')}</Text>
            <Text variant="caption">{t('fatigue.subtitle')}</Text>
          </View>
          {isLoading ? (
            <Text>{t('common.loading')}</Text>
          ) : loadError || !snapshot || clockError ? (
            <View className="gap-3">
              <Text tone="danger" accessibilityRole="alert">
                {t(
                  clockError
                    ? 'fatigue.errors.clockChanged'
                    : 'fatigue.loadError',
                )}
              </Text>
              {__DEV__ && model.loadDetails && (
                <Text variant="caption" testID="fatigue-load-details">
                  {t('fatigue.loadDetails', {
                    version: SCHEMA_VERSION,
                    message: model.loadDetails,
                  })}
                </Text>
              )}
              <Action
                onPress={() => {
                  void model.refresh();
                }}
              >
                {t('common.retry')}
              </Action>
            </View>
          ) : (
            <View
              style={{
                flexDirection: landscape ? 'row' : 'column',
                gap: 16,
                alignItems: 'stretch',
              }}
            >
              <View
                style={{
                  ...(landscape ? { flex: 1 } : {}),
                  minWidth: 0,
                  gap: 12,
                }}
              >
                <Card className="gap-3 bg-surface-raised p-5">
                  {form ? (
                    <View className="gap-4">
                      <Text variant="label">{formTitle}</Text>
                      {form.type !== 'addSleep' && (
                        <View className="flex-row flex-wrap gap-2">
                          <View className="min-w-24 flex-1">
                            <Action
                              disabled={isSaving}
                              selected={form.useNow}
                              onPress={() => {
                                Keyboard.dismiss();
                                update({
                                  useNow: true,
                                  to: sleepTimeInput(Date.now()),
                                });
                              }}
                            >
                              {t('fatigue.now')}
                            </Action>
                          </View>
                          <View className="min-w-24 flex-1">
                            <Action
                              disabled={isSaving}
                              selected={!form.useNow}
                              onPress={() => update({ useNow: false })}
                            >
                              {t('fatigue.otherTime')}
                            </Action>
                          </View>
                        </View>
                      )}
                      {form.type === 'addSleep' && (
                        <SleepDateTimeField
                          label={t('fatigue.sleepTime')}
                          value={form.from}
                          now={now}
                          onChange={(from) => update({ from })}
                          disabled={isSaving}
                        />
                      )}
                      <SleepDateTimeField
                        label={t(
                          form.type === 'sleep'
                            ? 'fatigue.sleepTime'
                            : 'fatigue.wakeTime',
                        )}
                        value={form.useNow ? sleepTimeInput(now) : form.to}
                        now={now}
                        onChange={(to) => update({ to })}
                        disabled={isSaving || form.useNow}
                      />
                      <Text variant="caption">
                        {form.type === 'addSleep'
                          ? t('fatigue.pastHint')
                          : open
                            ? t('fatigue.sleepAt', {
                                time: formatDate(open.slept_at, true),
                              })
                            : t('fatigue.declaredHint')}
                      </Text>
                      {error && (
                        <Text tone="danger" accessibilityRole="alert">
                          {t(`fatigue.errors.${error}`)}
                        </Text>
                      )}
                      {(error === 'stale' || error === 'invalidState') && (
                        <Action
                          disabled={isSaving}
                          onPress={() => {
                            cancel();
                            void model.refresh();
                          }}
                        >
                          {t('fatigue.reload')}
                        </Action>
                      )}
                      <Action
                        primary
                        disabled={disabled}
                        onPress={() => {
                          void save();
                        }}
                      >
                        {t(isSaving ? 'fatigue.saving' : 'fatigue.save')}
                      </Action>
                      <Action disabled={isSaving} onPress={cancel}>
                        {t('fatigue.cancel')}
                      </Action>
                    </View>
                  ) : (
                    <>
                      <Text variant="caption" className="font-semibold">
                        {t(
                          open
                            ? 'fatigue.openSleep'
                            : snapshot.wokeAt === null
                              ? 'fatigue.firstUse'
                              : 'fatigue.sinceWake',
                        )}
                      </Text>
                      <Text
                        testID="fatigue-counter"
                        style={{
                          fontSize: Math.min(64, Math.max(48, width * 0.16)),
                          lineHeight: 72,
                          fontWeight: '700',
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {snapshot.wokeAt === null
                          ? '—'
                          : formatDuration(
                              now - (open?.slept_at ?? snapshot.wokeAt),
                            )}
                      </Text>
                      <Text variant="caption">
                        {open
                          ? t('fatigue.sleepAt', {
                              time: formatDate(open.slept_at, true),
                            })
                          : snapshot.wokeAt === null
                            ? t('fatigue.emptyHint')
                            : t('fatigue.wakeAt', {
                                time: formatDate(snapshot.wokeAt, true),
                              })}
                      </Text>
                      {open && (
                        <Text variant="caption">
                          {t('fatigue.openSleepHint')}
                        </Text>
                      )}
                      <Action
                        primary
                        disabled={disabled}
                        onPress={() =>
                          start(
                            open || snapshot.wokeAt === null ? 'wake' : 'sleep',
                          )
                        }
                      >
                        {t(
                          open || snapshot.wokeAt === null
                            ? 'fatigue.recordWake'
                            : 'fatigue.recordSleep',
                        )}
                      </Action>
                      {!open && snapshot.wokeAt !== null && (
                        <Action
                          disabled={disabled}
                          onPress={() => start('correctWake')}
                        >
                          {t('fatigue.correctWake')}
                        </Action>
                      )}
                      <Action
                        disabled={disabled}
                        onPress={() => start('addSleep')}
                      >
                        {t('fatigue.addSleep')}
                      </Action>
                    </>
                  )}
                </Card>
                {feedback && (
                  <View className="rounded-xl border border-info-line bg-info-surface p-3">
                    <Text tone="info" accessibilityLiveRegion="polite">
                      {t(`fatigue.${feedback}`)}
                    </Text>
                  </View>
                )}
                <Text variant="caption">{t('fatigue.note')}</Text>
              </View>
              <View style={{ ...(landscape ? { flex: 1 } : {}), minWidth: 0 }}>
                <Card className="gap-3">
                  <Text variant="label">{t('fatigue.history')}</Text>
                  <Text variant="caption">{`${formatDate(history[6].startedAt)} – ${formatDate(history[0].startedAt)}`}</Text>
                  {history.map((day) => (
                    <View
                      key={day.startedAt}
                      className="gap-2 border-t border-line pt-3"
                    >
                      <View className="flex-row flex-wrap items-center justify-between gap-2">
                        <Text className="font-semibold">
                          {formatDate(day.startedAt)}
                        </Text>
                        <Text
                          className="text-lg font-semibold tabular-nums"
                          accessibilityLabel={
                            day.totalMs === null
                              ? undefined
                              : t('fatigue.sleepDuration', {
                                  time: formatDuration(day.totalMs),
                                })
                          }
                        >
                          {day.totalMs === null
                            ? '—'
                            : formatDuration(day.totalMs)}
                        </Text>
                      </View>
                      {!day.entries.length ? (
                        <Text variant="caption">{t('fatigue.missing')}</Text>
                      ) : (
                        day.entries.map((entry) => (
                          <View key={entry.id} className="gap-1">
                            <Text>{`${clock(entry.slept_at)} – ${clock(entry.woke_at!)}`}</Text>
                            <Text variant="caption">{`${formatDate(entry.slept_at)} → ${formatDate(entry.woke_at!)}`}</Text>
                          </View>
                        ))
                      )}
                    </View>
                  ))}
                  <Text variant="caption">{t('fatigue.historyHint')}</Text>
                </Card>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
