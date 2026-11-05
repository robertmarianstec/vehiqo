import { useTranslation } from 'react-i18next';
import { TouchableOpacity, View } from 'react-native';

import {
  FatigueError,
  formatLocalSleepTime,
  getLocalSleepTimeOptions,
  getSleepUtcOffset,
} from '@/utils/fatigue';

import { DateTimeControl } from './DateTimeControl';
import { Text } from './Text';

export interface SleepTimeInput {
  date: string;
  time: string;
  occurrence: number | null;
}

export function sleepTimeInput(timestamp: number): SleepTimeInput {
  const formatted = formatLocalSleepTime(timestamp);
  const options = getLocalSleepTimeOptions(formatted.date, formatted.time);
  const minute = Math.floor(timestamp / 60000) * 60000;
  return { ...formatted, occurrence: options.includes(minute) ? minute : null };
}

export function readSleepTime(input: SleepTimeInput): number {
  const options = getLocalSleepTimeOptions(input.date, input.time);
  if (options.length === 1) return options[0];
  if (input.occurrence === null || !options.includes(input.occurrence))
    throw new FatigueError('ambiguousTime');
  return input.occurrence;
}

export function SleepDateTimeField({
  label,
  value,
  now,
  onChange,
  disabled,
}: {
  label: string;
  value: SleepTimeInput;
  now: number;
  onChange: (value: SleepTimeInput) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  let options: number[] = [];
  try {
    options = getLocalSleepTimeOptions(value.date, value.time);
  } catch {
    /* Missing selections are validated on submit. */
  }
  function pickerValue(mode: 'date' | 'time') {
    const current = formatLocalSleepTime(now);
    try {
      // A fixed time-only date keeps native selection independent of DST gaps.
      return new Date(
        getLocalSleepTimeOptions(
          mode === 'date' ? value.date : '15.01.2000',
          mode === 'date' ? '12:00' : value.time || current.time,
        )[0],
      );
    } catch {
      return new Date(now);
    }
  }
  function choose(mode: 'date' | 'time', selected: Date) {
    const formatted = formatLocalSleepTime(selected.getTime());
    onChange({ ...value, [mode]: formatted[mode], occurrence: null });
  }
  return (
    <View className="gap-2">
      <Text className="font-semibold">{label}</Text>
      <View className="flex-row flex-wrap gap-3">
        <View className="min-w-36 flex-1 gap-1">
          <Text variant="caption">{t('fatigue.dateLabel')}</Text>
          <DateTimeControl
            mode="date"
            label={`${label}: ${t('fatigue.dateLabel')}`}
            text={value.date || t('fatigue.selectDate')}
            value={pickerValue('date')}
            now={now}
            selected={!!value.date}
            disabled={disabled}
            onChange={(selected) => choose('date', selected)}
          />
        </View>
        <View className="min-w-24 flex-1 gap-1">
          <Text variant="caption">{t('fatigue.timeLabel')}</Text>
          <DateTimeControl
            mode="time"
            label={`${label}: ${t('fatigue.timeLabel')}`}
            text={value.time || t('fatigue.selectTime')}
            value={pickerValue('time')}
            now={now}
            selected={!!value.time}
            disabled={disabled}
            onChange={(selected) => choose('time', selected)}
          />
        </View>
      </View>
      {options.length > 1 && (
        <View className="gap-2">
          <Text variant="caption">{t('fatigue.ambiguousHint')}</Text>
          {options.map((timestamp, index) => (
            <TouchableOpacity
              key={timestamp}
              accessibilityRole="radio"
              accessibilityState={{
                checked: value.occurrence === timestamp,
                disabled,
              }}
              disabled={disabled}
              onPress={() => onChange({ ...value, occurrence: timestamp })}
              className={`min-h-12 justify-center rounded-xl border px-3 py-3 ${value.occurrence === timestamp ? 'border-brand bg-info-surface' : 'border-line-control bg-surface-control'}`}
            >
              <Text>
                {t(
                  index === 0
                    ? 'fatigue.firstOccurrence'
                    : 'fatigue.secondOccurrence',
                  { offset: getSleepUtcOffset(timestamp) },
                )}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
