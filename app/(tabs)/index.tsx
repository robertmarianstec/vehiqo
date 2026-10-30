import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { styled } from 'nativewind';
import { useTranslation } from 'react-i18next';
import { ScrollView, TouchableOpacity, View } from 'react-native';

import {
  Card,
  DayTimelineBar,
  ModeButton,
  ProgressBar,
  ScreenContainer,
  Text,
} from '@/components';
import {
  MAX_BIWEEKLY_DRIVING_MS,
  MAX_WEEKLY_DRIVING_MS,
} from '@/constants/euRegulations';
import type { WorkMode } from '@/db/types';
import { useWorkTimerContext } from '@/hooks/WorkTimerProvider';
import { formatDuration } from '@/utils/format';

const Icon = styled(MaterialCommunityIcons);

export default function TimerScreen() {
  const { t } = useTranslation();
  const {
    currentMode,
    counters,
    isLoading,
    todayBounds,
    todaySegments,
    dailyDrivingLimit,
    switchMode,
  } = useWorkTimerContext();

  const modeLabels: Record<WorkMode, string> = {
    driving: t('workTimer.modes.driving'),
    other_work: t('workTimer.modes.other_work'),
    standby: t('workTimer.modes.standby'),
    break: t('workTimer.modes.break'),
    rest: t('workTimer.modes.rest'),
  };

  const renderButton = (mode: WorkMode) => (
    <ModeButton
      mode={mode}
      label={modeLabels[mode]}
      selected={currentMode === mode}
      onPress={() => {
        void switchMode(mode);
      }}
    />
  );

  if (isLoading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text>{t('common.loading')}</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Secondary counters, and where future cards (hints, fatigue…) slot in. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="px-4 pt-4 gap-4"
      >
        <View className="flex-row gap-3">
          <Card className="flex-1 gap-1.5">
            <Text variant="eyebrow">{t('workTimer.counters.daily')}</Text>
            <Text variant="heading">
              {formatDuration(counters.dailyDriving)}
            </Text>
            <ProgressBar
              value={counters.dailyDriving}
              limit={dailyDrivingLimit}
            />
            <Text variant="timestamp">
              / {formatDuration(dailyDrivingLimit)}
            </Text>
          </Card>
          <Card className="flex-1 gap-1.5">
            <Text variant="eyebrow">{t('workTimer.counters.weekly')}</Text>
            <Text variant="heading">
              {formatDuration(counters.weeklyDriving)}
            </Text>
            <ProgressBar
              value={counters.weeklyDriving}
              limit={MAX_WEEKLY_DRIVING_MS}
            />
            <Text variant="timestamp">
              / {formatDuration(MAX_WEEKLY_DRIVING_MS)}
            </Text>
          </Card>
          <Card className="flex-1 gap-1.5">
            <Text variant="eyebrow">{t('workTimer.counters.biweekly')}</Text>
            <Text variant="heading">
              {formatDuration(counters.biweeklyDriving)}
            </Text>
            <ProgressBar
              value={counters.biweeklyDriving}
              limit={MAX_BIWEEKLY_DRIVING_MS}
            />
            <Text variant="timestamp">
              / {formatDuration(MAX_BIWEEKLY_DRIVING_MS)}
            </Text>
          </Card>
        </View>

        {/* The counters show the basic 9h variant; the driver has to be able to
            see what they leave out without hunting for it. */}
        <Link href="/limitations" asChild>
          <TouchableOpacity
            className="flex-row items-center justify-center gap-1.5 py-1"
            accessibilityRole="link"
          >
            <Icon
              name="information-outline"
              size={14}
              className="text-gray-500 dark:text-ink-muted"
            />
            <Text variant="timestamp">{t('limitations.link')}</Text>
          </TouchableOpacity>
        </Link>

        <DayTimelineBar segments={todaySegments} bounds={todayBounds} />
      </ScrollView>

      <View className="gap-2 px-4 pb-4 pt-4">
        <View className="flex-row gap-2">
          {renderButton('other_work')}
          {renderButton('standby')}
        </View>
        <View className="flex-row gap-2">
          {renderButton('break')}
          {renderButton('rest')}
        </View>
        <View className="flex-row">{renderButton('driving')}</View>
      </View>
    </ScreenContainer>
  );
}
