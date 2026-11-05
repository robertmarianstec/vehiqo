import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';

import { useAppTheme } from '@/hooks/useAppTheme';

import type { TimeDialProps } from './TimeDial.types';

export function TimeDial({ label, value, onChange }: TimeDialProps) {
  const { i18n } = useTranslation();
  const theme = useAppTheme();
  return (
    <DateTimePicker
      testID="inline-time-dial"
      accessibilityLabel={label}
      mode="time"
      value={value}
      display="spinner"
      locale={i18n.resolvedLanguage?.startsWith('pl') ? 'pl-PL' : 'en-GB'}
      themeVariant={theme.dark ? 'dark' : 'light'}
      textColor={
        typeof theme.colors.text === 'string' ? theme.colors.text : undefined
      }
      onValueChange={(_event, selected) => onChange(selected)}
      style={{ height: 216, alignSelf: 'stretch' }}
    />
  );
}
