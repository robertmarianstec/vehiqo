import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

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
  MAX_DAILY_DRIVING_REGULAR_MS,
  MAX_WEEKLY_DRIVING_MS,
} from '@/constants/euRegulations';
import type { WorkMode } from '@/db/types';
import { useWorkTimerContext } from '@/hooks/WorkTimerProvider';
import { formatDuration } from '@/utils/format';

export default function TimerScreen() {
  const { t } = useTranslation();
  const { currentMode, counters, isLoading, todayBounds, todaySegments, switchMode } =
    useWorkTimerContext();

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
      <ScrollView style={{ flex: 1 }} contentContainerClassName="px-4 pt-4 gap-4">
        <View className="flex-row gap-3">
          <Card className="flex-1 gap-1.5">
            <Text variant="eyebrow">{t('workTimer.counters.daily')}</Text>
            <Text variant="heading">
              {formatDuration(counters.dailyDriving)}
            </Text>
            <ProgressBar
              value={counters.dailyDriving}
              limit={MAX_DAILY_DRIVING_REGULAR_MS}
            />
            <Text variant="timestamp">
              / {formatDuration(MAX_DAILY_DRIVING_REGULAR_MS)}
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

        <DayTimelineBar segments={todaySegments} bounds={todayBounds} />
      </ScrollView>

      <View className="gap-2 px-4 pb-4 pt-4">
        <View className="flex-row">{renderButton('driving')}</View>
        <View className="flex-row gap-2">
          {renderButton('other_work')}
          {renderButton('standby')}
        </View>
        <View className="flex-row gap-2">
          {renderButton('break')}
          {renderButton('rest')}
        </View>
      </View>
    </ScreenContainer>
  );
}
