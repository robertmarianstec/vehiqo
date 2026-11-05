import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pastedTime, readTimeParts } from '@/utils/timeInput';

import { Text } from './Text';
import { TimeDial } from './TimeDial';

export function TimePickerDialog({
  label,
  value,
  onConfirm,
  onCancel,
}: {
  label: string;
  value: Date;
  onConfirm: (value: Date) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [showDial, setShowDial] = useState(false);
  const { height } = useWindowDimensions();
  const compact = height < 420;
  const inputStyle = {
    minHeight: compact ? 48 : 64,
    fontSize: compact ? 24 : 30,
    paddingVertical: compact ? 8 : 12,
  };
  const [hours, setHours] = useState(() =>
    String(value.getHours()).padStart(2, '0'),
  );
  const [minutes, setMinutes] = useState(() =>
    String(value.getMinutes()).padStart(2, '0'),
  );
  const [hourSelection, setHourSelection] = useState({ start: 0, end: 2 });
  const [minuteSelection, setMinuteSelection] = useState({ start: 0, end: 2 });
  const [submitted, setSubmitted] = useState(false);
  const [invalidInput, setInvalidInput] = useState(false);
  const hourInput = useRef<ComponentRef<typeof TextInput>>(null);
  const minuteInput = useRef<ComponentRef<typeof TextInput>>(null);
  const focused = useRef<'hours' | 'minutes'>('hours');
  useEffect(
    () => () => {
      Keyboard.dismiss();
    },
    [],
  );
  const hourInvalid = hours !== '' && Number(hours) > 23;
  const minuteInvalid = minutes !== '' && Number(minutes) > 59;
  const error = invalidInput
    ? 'invalidTimeInput'
    : hourInvalid
      ? 'hoursRange'
      : minuteInvalid
        ? 'minutesRange'
        : submitted && (!hours || !minutes)
          ? 'timeRequired'
          : null;
  function focusCurrent() {
    (focused.current === 'hours' ? hourInput : minuteInput).current?.focus();
  }
  function edit(part: 'hours' | 'minutes', text: string) {
    const input = text.trim();
    const whole = pastedTime(input);
    if (whole) {
      setHours(whole.hours);
      setMinutes(whole.minutes);
      setHourSelection({ start: 2, end: 2 });
      setMinuteSelection({ start: 0, end: 2 });
      setSubmitted(false);
      setInvalidInput(false);
      minuteInput.current?.focus();
      return;
    }
    if (!/^\d{0,2}$/.test(input)) {
      setInvalidInput(true);
      return;
    }
    setSubmitted(false);
    setInvalidInput(false);
    if (part === 'hours') {
      setHours(input);
      setHourSelection({ start: input.length, end: input.length });
      if (/^\d{2}$/.test(input) && Number(input) <= 23)
        minuteInput.current?.focus();
    } else {
      setMinutes(input);
      setMinuteSelection({ start: input.length, end: input.length });
    }
  }
  function next() {
    if (!hours || hourInvalid) {
      setSubmitted(true);
      hourInput.current?.focus();
      return;
    }
    setHours((current) => current.padStart(2, '0'));
    minuteInput.current?.focus();
  }
  function confirm() {
    if (invalidInput) {
      hourInput.current?.focus();
      return;
    }
    const parsed = readTimeParts(hours, minutes);
    if (!parsed) {
      setSubmitted(true);
      (!hours || hourInvalid ? hourInput : minuteInput).current?.focus();
      return;
    }
    Keyboard.dismiss();
    onConfirm(new Date(2000, 0, 15, parsed.hour, parsed.minute));
  }
  function cancel() {
    Keyboard.dismiss();
    onCancel();
  }
  function toggleMode() {
    if (showDial) {
      focused.current = 'hours';
      setShowDial(false);
      return;
    }
    const parsed = readTimeParts(hours, minutes);
    if (invalidInput || !parsed) {
      setSubmitted(true);
      (invalidInput || !hours || hourInvalid
        ? hourInput
        : minuteInput
      ).current?.focus();
      return;
    }
    setHours(String(parsed.hour).padStart(2, '0'));
    setMinutes(String(parsed.minute).padStart(2, '0'));
    Keyboard.dismiss();
    setShowDial(true);
  }
  function choose(selected: Date | null) {
    setHours(selected ? String(selected.getHours()).padStart(2, '0') : '');
    setMinutes(selected ? String(selected.getMinutes()).padStart(2, '0') : '');
    setHourSelection({ start: 0, end: 2 });
    setMinuteSelection({ start: 0, end: 2 });
    setSubmitted(!selected);
    setInvalidInput(false);
  }
  const parsed = readTimeParts(hours, minutes);
  return (
    <Modal
      presentationStyle="fullScreen"
      animationType="fade"
      onRequestClose={cancel}
      onShow={focusCurrent}
    >
      <View className="flex-1 bg-canvas">
        <SafeAreaView testID="numeric-time-safe-area" style={{ flex: 1 }}>
          <KeyboardAvoidingView
            testID="numeric-time-keyboard-area"
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              testID="numeric-time-scroll"
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'flex-start',
                padding: compact ? 8 : 16,
              }}
            >
              <View
                testID="numeric-time-dialog"
                accessibilityViewIsModal
                style={{ gap: compact ? 8 : 16, padding: compact ? 12 : 16 }}
                className="w-full max-w-2xl self-center rounded-2xl border border-line bg-surface"
              >
                <View className="flex-row flex-wrap items-center gap-3">
                  <Text variant={compact ? 'body' : 'label'} className="flex-1">
                    {label}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showDial }}
                    onPress={toggleMode}
                    className="min-h-12 items-center justify-center rounded-xl border border-line-control bg-surface-control px-4 py-3"
                  >
                    <Text>
                      {t(
                        showDial
                          ? 'fatigue.keyboard'
                          : Platform.OS === 'android'
                            ? 'fatigue.dial'
                            : Platform.OS === 'ios'
                              ? 'fatigue.wheels'
                              : 'fatigue.clock',
                      )}
                    </Text>
                  </TouchableOpacity>
                </View>
                {showDial ? (
                  <TimeDial
                    label={label}
                    value={
                      parsed
                        ? new Date(2000, 0, 15, parsed.hour, parsed.minute)
                        : value
                    }
                    onChange={choose}
                  />
                ) : (
                  <View className="flex-row items-end gap-3">
                    <View
                      style={{ gap: compact ? 4 : 8 }}
                      className="min-w-20 flex-1"
                    >
                      <Text variant="caption">{t('fatigue.hours')}</Text>
                      <TextInput
                        ref={hourInput}
                        accessibilityLabel={t('fatigue.hours')}
                        value={hours}
                        autoFocus
                        style={inputStyle}
                        onChangeText={(text) => edit('hours', text)}
                        inputMode="numeric"
                        keyboardType="number-pad"
                        autoComplete="off"
                        autoCorrect={false}
                        selection={hourSelection}
                        onSelectionChange={(event) =>
                          setHourSelection(event.nativeEvent.selection)
                        }
                        disableFullscreenUI
                        maxLength={5}
                        returnKeyType="next"
                        submitBehavior="submit"
                        onSubmitEditing={next}
                        onFocus={() => {
                          focused.current = 'hours';
                          setHourSelection({ start: 0, end: hours.length });
                        }}
                        onBlur={() =>
                          setHours((current) =>
                            /^\d$/.test(current)
                              ? current.padStart(2, '0')
                              : current,
                          )
                        }
                        className={`rounded-xl border bg-surface-control px-3 text-center font-semibold tabular-nums text-ink ${hourInvalid ? 'border-danger-line' : 'border-line-control'}`}
                      />
                    </View>
                    <Text
                      accessible={false}
                      style={{
                        fontSize: compact ? 24 : 30,
                        paddingBottom: compact ? 8 : 16,
                      }}
                    >
                      :
                    </Text>
                    <View
                      style={{ gap: compact ? 4 : 8 }}
                      className="min-w-20 flex-1"
                    >
                      <Text variant="caption">{t('fatigue.minutes')}</Text>
                      <TextInput
                        ref={minuteInput}
                        accessibilityLabel={t('fatigue.minutes')}
                        value={minutes}
                        style={inputStyle}
                        onChangeText={(text) => edit('minutes', text)}
                        inputMode="numeric"
                        keyboardType="number-pad"
                        autoComplete="off"
                        autoCorrect={false}
                        selection={minuteSelection}
                        onSelectionChange={(event) =>
                          setMinuteSelection(event.nativeEvent.selection)
                        }
                        disableFullscreenUI
                        maxLength={5}
                        returnKeyType="done"
                        submitBehavior="submit"
                        onFocus={() => {
                          focused.current = 'minutes';
                          setMinuteSelection({ start: 0, end: minutes.length });
                        }}
                        onBlur={() =>
                          setMinutes((current) =>
                            /^\d$/.test(current)
                              ? current.padStart(2, '0')
                              : current,
                          )
                        }
                        onKeyPress={(event) => {
                          if (event.nativeEvent.key === 'Backspace' && !minutes)
                            hourInput.current?.focus();
                        }}
                        onSubmitEditing={confirm}
                        className={`rounded-xl border bg-surface-control px-3 text-center font-semibold tabular-nums text-ink ${minuteInvalid ? 'border-danger-line' : 'border-line-control'}`}
                      />
                    </View>
                  </View>
                )}
                {error && (
                  <Text tone="danger" accessibilityRole="alert">
                    {t(`fatigue.${error}`)}
                  </Text>
                )}
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={cancel}
                    className="min-h-12 flex-1 items-center justify-center rounded-xl border border-line-control bg-surface-control px-4 py-3"
                  >
                    <Text>{t('fatigue.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={confirm}
                    className="min-h-12 flex-1 items-center justify-center rounded-xl border border-brand bg-brand px-4 py-3"
                  >
                    <Text className="font-semibold text-on-brand">
                      {t('fatigue.pickerConfirm')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
