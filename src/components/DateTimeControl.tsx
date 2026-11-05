import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/hooks/useAppTheme';

import type { DateTimeControlProps } from './DateTimeControl.types';
import { Text } from './Text';
import { TimePickerDialog } from './TimePickerDialog';

export function DateTimeControl({
  mode,
  label,
  text,
  value,
  now,
  disabled,
  onChange,
}: DateTimeControlProps) {
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const [draft, setDraft] = useState<Date | null>(null);
  const [timeDraft, setTimeDraft] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const blocked = useRef(disabled);
  useLayoutEffect(() => {
    blocked.current = disabled;
  }, [disabled]);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (Platform.OS === 'android' && pending.current)
        void DateTimePickerAndroid.dismiss(mode).catch(() => {});
    };
  }, [mode]);
  function open() {
    if (disabled || pending.current) return;
    setFailed(false);
    if (mode === 'time') setTimeDraft(value);
    else openDate(value);
  }
  function finish(selected: Date) {
    if (mounted.current && !blocked.current) onChange(selected);
    Keyboard.dismiss();
    setDraft(null);
    setTimeDraft(null);
  }
  function openDate(initial: Date) {
    if (blocked.current || pending.current) return;
    setFailed(false);
    if (Platform.OS === 'android') {
      pending.current = true;
      DateTimePickerAndroid.open({
        mode,
        value: initial,
        display: 'default',
        is24Hour: true,
        ...(mode === 'date'
          ? { minimumDate: new Date(0), maximumDate: new Date(now) }
          : {}),
        positiveButton: {
          label: t('fatigue.pickerConfirm'),
          textColor: theme.colors.primary,
        },
        negativeButton: {
          label: t('fatigue.cancel'),
          textColor: theme.colors.primary,
        },
        onValueChange: (_event, selected) => {
          pending.current = false;
          if (mounted.current) finish(selected);
        },
        onDismiss: () => {
          pending.current = false;
        },
        onError: () => {
          pending.current = false;
          if (mounted.current) {
            setFailed(true);
          }
        },
      });
    } else setDraft(initial);
  }
  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t(
          mode === 'date' ? 'fatigue.datePickerHint' : 'fatigue.timePickerHint',
        )}
        accessibilityValue={{ text }}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={open}
        className={`min-h-12 justify-center rounded-xl border bg-surface-control px-3 py-3 ${draft ? 'border-brand' : 'border-line-control'}`}
      >
        <Text tone={disabled ? 'muted' : 'primary'}>{text}</Text>
      </TouchableOpacity>
      {timeDraft && (
        <TimePickerDialog
          label={label}
          value={timeDraft}
          onConfirm={finish}
          onCancel={() => setTimeDraft(null)}
        />
      )}
      {failed && !timeDraft && (
        <Text tone="danger" accessibilityRole="alert">
          {t('fatigue.pickerError')}
        </Text>
      )}
      {draft && (
        <Modal
          transparent
          animationType="slide"
          onRequestClose={() => setDraft(null)}
        >
          <View className="flex-1 bg-canvas/90">
            <SafeAreaView
              testID="system-date-time-safe-area"
              style={{ flex: 1 }}
            >
              <ScrollView
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: 'flex-end',
                }}
              >
                <View
                  testID="system-date-time-dialog"
                  accessibilityViewIsModal
                  className="w-full max-w-2xl self-center rounded-t-2xl border border-line bg-surface"
                >
                  <View className="p-4">
                    <Text variant="label">{label}</Text>
                  </View>
                  <DateTimePicker
                    testID="system-date-time-picker"
                    mode={mode}
                    value={draft}
                    display="spinner"
                    locale={
                      i18n.resolvedLanguage?.startsWith('pl')
                        ? 'pl-PL'
                        : 'en-GB'
                    }
                    themeVariant={theme.dark ? 'dark' : 'light'}
                    textColor={
                      typeof theme.colors.text === 'string'
                        ? theme.colors.text
                        : undefined
                    }
                    {...(mode === 'date'
                      ? { minimumDate: new Date(0), maximumDate: new Date(now) }
                      : {})}
                    onValueChange={(_event, selected) => setDraft(selected)}
                    style={{ height: 216, alignSelf: 'stretch' }}
                  />
                  <View className="flex-row gap-3 p-4">
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => setDraft(null)}
                      className="min-h-12 flex-1 items-center justify-center rounded-xl border border-line-control bg-surface-control px-4 py-3"
                    >
                      <Text>{t('fatigue.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => {
                        finish(draft);
                      }}
                      className="min-h-12 flex-1 items-center justify-center rounded-xl border border-brand bg-brand px-4 py-3"
                    >
                      <Text className="font-semibold text-on-brand">
                        {t('fatigue.pickerConfirm')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </SafeAreaView>
          </View>
        </Modal>
      )}
    </>
  );
}
