import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { styled } from 'nativewind';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  ScrollView,
  Text as RNText,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

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
  const { fontScale } = useWindowDimensions();
  const [detailsHeight, setDetailsHeight] = useState<number>();
  // Measure the remaining space after the pinned controls, not the whole phone.
  const compactDetails =
    detailsHeight !== undefined && detailsHeight < 144 * fontScale;
  const counterCardClass = compactDetails ? 'flex-1 gap-0.5' : 'flex-1 gap-1.5';
  const counterLabelClass = compactDetails
    ? 'font-extrabold uppercase tracking-wide'
    : undefined;
  const {
    currentMode,
    counters,
    isLoading,
    loadError,
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
        void switchMode(mode).catch(() => {
          Alert.alert(t('common.error'), t('workTimer.saveError'));
        });
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

  if (loadError) return null;

  return (
    <ScreenContainer>
      {/* Secondary counters, and where future cards (hints, fatigue…) slot in. */}
      <ScrollView
        testID="timer-details"
        style={{ flex: 1 }}
        onLayout={({ nativeEvent }) =>
          setDetailsHeight(nativeEvent.layout.height)
        }
        contentContainerClassName={
          compactDetails ? 'px-4 pt-1 gap-2' : 'px-4 pt-4 gap-4'
        }
      >
        <View className={compactDetails ? 'flex-row gap-2' : 'flex-row gap-3'}>
          <Card compact={compactDetails} className={counterCardClass}>
            <Text
              variant={compactDetails ? 'timestamp' : 'eyebrow'}
              className={counterLabelClass}
            >
              {t('workTimer.counters.daily')}
            </Text>
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
          <Card compact={compactDetails} className={counterCardClass}>
            <Text
              variant={compactDetails ? 'timestamp' : 'eyebrow'}
              className={counterLabelClass}
            >
              {t('workTimer.counters.weekly')}
            </Text>
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
          <Card compact={compactDetails} className={counterCardClass}>
            <Text
              variant={compactDetails ? 'timestamp' : 'eyebrow'}
              className={counterLabelClass}
            >
              {t('workTimer.counters.biweekly')}
            </Text>
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
              className="text-ink-muted"
            />
            <Text variant="timestamp">{t('limitations.link')}</Text>
          </TouchableOpacity>
        </Link>

        <DayTimelineBar
          segments={todaySegments}
          bounds={todayBounds}
          compact={compactDetails}
          headerAction={
            <Link href="/reports" asChild>
              <TouchableOpacity
                accessibilityRole="link"
                accessibilityLabel={t('reports.title')}
                className="min-h-11 flex-row items-center justify-center gap-1.5 rounded-lg px-2"
              >
                <Icon
                  name="file-document-outline"
                  size={20}
                  className="text-brand"
                />
                <RNText className="text-sm font-semibold text-brand">
                  {t('reports.link')}
                </RNText>
              </TouchableOpacity>
            </Link>
          }
        />
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
