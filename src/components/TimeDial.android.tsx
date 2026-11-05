import { DateTimePicker, Host } from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/hooks/useAppTheme';
import { useThemeColor } from '@/hooks/useThemeColor';

import type { TimeDialProps } from './TimeDial.types';

export function TimeDial({ label, value, onChange }: TimeDialProps) {
  const theme = useAppTheme();
  const surface = useThemeColor('--surface') ?? theme.colors.card;
  const control = useThemeColor('--surface-control') ?? theme.colors.card;
  const onBrand = useThemeColor('--on-brand') ?? theme.colors.background;
  // Updating the native seed after each tick resets the clock's hour/minute selection.
  const [initialDate] = useState(() => value.toISOString());
  return (
    <View testID="inline-time-dial" accessibilityLabel={label}>
      <Host
        matchContents={{ vertical: true }}
        style={{ width: '100%' }}
        colorScheme={theme.dark ? 'dark' : 'light'}
        ignoreSafeAreaKeyboardInsets
      >
        <DateTimePicker
          displayedComponents="hourAndMinute"
          variant="picker"
          showVariantToggle={false}
          initialDate={initialDate}
          is24Hour
          elementColors={{
            containerColor: surface,
            clockDialColor: control,
            clockDialContentColor: theme.colors.text,
            clockDialSelectedContentColor: onBrand,
            selectorColor: theme.colors.primary,
            timeSelectorContainerColor: control,
            timeSelectorContentColor: theme.colors.text,
            timeSelectorSelectedContainerColor: theme.colors.primary,
            timeSelectorSelectedContentColor: onBrand,
          }}
          onDateSelected={(selected) => {
            onChange(
              selected && Number.isFinite(selected.getTime()) ? selected : null,
            );
          }}
        />
      </Host>
    </View>
  );
}
