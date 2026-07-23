import { MaterialCommunityIcons } from '@expo/vector-icons';
import { styled } from 'nativewind';
import { useTranslation } from 'react-i18next';
import { Alert, Text as RNText, TouchableOpacity, View } from 'react-native';

import { ScreenContainer, Text } from '@/components';
import { clearAllLocalData } from '@/db/queries';
import type { ThemePreference } from '@/db/types';
import { useThemePreference } from '@/hooks/useThemePreference';

const Icon = styled(MaterialCommunityIcons);

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const THEME_ICONS: Record<ThemePreference, IconName> = {
  system: 'theme-light-dark',
  light: 'white-balance-sunny',
  dark: 'weather-night',
};

function ThemePicker() {
  const { t } = useTranslation();
  const { preference, setPreference } = useThemePreference();
  const options: ThemePreference[] = ['system', 'light', 'dark'];

  return (
    <View className="w-full gap-2">
      <Text variant="eyebrow">{t('settings.theme.title')}</Text>
      <View className="flex-row gap-2">
        {options.map((option) => {
          const selected = preference === option;
          const tint = selected
            ? 'text-brand'
            : 'text-gray-500 dark:text-ink-muted';
          return (
            <TouchableOpacity
              key={option}
              onPress={() => {
                void setPreference(option);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`h-16 flex-1 items-center justify-center gap-1 rounded-2xl border-2 ${
                selected
                  ? 'border-brand bg-brand/10'
                  : 'border-gray-300 bg-gray-100 dark:border-night-border dark:bg-night-elevated'
              }`}
            >
              <Icon name={THEME_ICONS[option]} size={20} className={tint} />
              <RNText className={`text-xs font-semibold ${tint}`}>
                {t(`settings.theme.${option}`)}
              </RNText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Dev-only: lets a developer wipe locally stored data (stale test sessions,
// bad counter states) without uninstalling Expo Go. __DEV__ is compiled to a
// static `false` in production builds, so Metro's minifier removes this
// entire block — it never reaches a real driver's build.
function DevTools() {
  const handleClear = () => {
    Alert.alert(
      'Clear all local data?',
      'This permanently deletes every work session, daily check, and fatigue record stored on this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearAllLocalData();
            Alert.alert(
              'Done',
              'All local data has been cleared. Reload the app to see the change.',
            );
          },
        },
      ],
    );
  };

  return (
    <View className="w-full gap-2 rounded-2xl border border-danger/30 bg-danger/5 p-4">
      <RNText className="text-sm font-bold uppercase tracking-wide text-danger">
        Developer tools
      </RNText>
      <TouchableOpacity
        className="items-center rounded-xl bg-danger px-6 py-4 active:opacity-80"
        onPress={handleClear}
      >
        <RNText className="text-base font-semibold text-white">
          Clear all local data
        </RNText>
      </TouchableOpacity>
    </View>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  return (
    <ScreenContainer className="items-center gap-6 px-4 pt-8">
      <Text variant="heading">{t('tabs.settings')}</Text>
      <ThemePicker />
      {__DEV__ && <DevTools />}
    </ScreenContainer>
  );
}
