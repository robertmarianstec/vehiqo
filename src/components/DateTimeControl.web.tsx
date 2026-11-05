import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TouchableOpacity } from 'react-native';

import { formatLocalSleepTime } from '@/utils/fatigue';

import type { DateTimeControlProps } from './DateTimeControl.types';
import { Text } from './Text';
import { TimePickerDialog } from './TimePickerDialog';

export function DateTimeControl({
  mode,
  label,
  text,
  value,
  now,
  selected,
  disabled,
  onChange,
}: DateTimeControlProps) {
  const { t } = useTranslation();
  const [timeOpen, setTimeOpen] = useState(false);
  const formatted = formatLocalSleepTime(value.getTime());
  function confirm(selected: Date) {
    if (!disabled) onChange(selected);
    setTimeOpen(false);
  }
  if (mode === 'time')
    return (
      <>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={t('fatigue.timePickerHint')}
          accessibilityState={{ disabled }}
          accessibilityValue={{ text }}
          disabled={disabled}
          onPress={() => {
            setTimeOpen(true);
          }}
          className="min-h-12 justify-center rounded-xl border border-line-control bg-surface-control px-3 py-3"
        >
          <Text tone={disabled ? 'muted' : 'primary'}>{text}</Text>
        </TouchableOpacity>
        {timeOpen && (
          <TimePickerDialog
            label={label}
            value={value}
            onConfirm={confirm}
            onCancel={() => setTimeOpen(false)}
          />
        )}
      </>
    );
  return (
    <input
      type="date"
      aria-label={label}
      disabled={disabled}
      value={selected ? formatted.date.split('.').reverse().join('-') : ''}
      min="1970-01-01"
      max={formatLocalSleepTime(now).date.split('.').reverse().join('-')}
      onChange={(event) => {
        if (!event.currentTarget.value) return;
        const [year, month, day] = event.currentTarget.value
          .split('-')
          .map(Number);
        onChange(new Date(year, month - 1, day, 12));
      }}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        minHeight: 48,
        minWidth: 0,
        borderRadius: 12,
        border: '1px solid var(--line-control)',
        background: 'var(--surface-control)',
        color: disabled ? 'var(--ink-muted)' : 'var(--ink)',
        padding: 12,
        fontFamily: 'inherit',
        fontSize: 16,
        colorScheme: 'light dark',
      }}
    />
  );
}
