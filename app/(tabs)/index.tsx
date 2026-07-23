import { useTranslation } from 'react-i18next';
import { ScrollView, Text as RNText, View } from 'react-native';

import {
  AlertBanner,
  Card,
  DayTimelineBar,
  ModeButton,
  ProgressBar,
  ScreenContainer,
  Text,
} from '@/components';
import {
  DRIVING_BEFORE_BREAK_MS,
  MAX_BIWEEKLY_DRIVING_MS,
  MAX_DAILY_DRIVING_REGULAR_MS,
  MAX_WEEKLY_DRIVING_MS,
} from '@/constants/euRegulations';
import { MODE_COLORS } from '@/constants/modeColors';
import type { WorkMode } from '@/db/types';
import { useDangerVibration } from '@/hooks/useDangerVibration';
import { useWorkTimerContext } from '@/hooks/WorkTimerProvider';
import { formatDuration } from '@/utils/format';

export default function TimerScreen() {
  const { t } = useTranslation();
  const {
    currentMode,
    counters,
    alerts,
    isLoading,
    todayBounds,
    todaySegments,
    switchMode,
  } = useWorkTimerContext();

  useDangerVibration(alerts);

  // Derive "remaining" from the elapsed value already floored to whole minutes,
  // so the on-screen counter and remaining time always sum to the exact limit
  // (formatDuration truncates seconds — computing both from the raw value would
  // display e.g. 1:00 + 3:29 instead of 1:00 + 3:30).
  const elapsedToMinute =
    Math.floor(counters.drivingSinceBreak / 60_000) * 60_000;
  const breakRemaining = DRIVING_BEFORE_BREAK_MS - elapsedToMinute;

  // The hero card takes on the active mode's colour (accent bar, dot, label);
  // with no session yet it falls back to a neutral muted tone.
  const modeColor = currentMode ? MODE_COLORS[currentMode] : null;
  const accentClass = modeColor ? modeColor.bg : 'bg-night-border';
  const dotClass = modeColor ? modeColor.bg : 'bg-ink-muted';
  const modeLabelClass = modeColor ? modeColor.text : 'text-ink-muted';

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
      {/* Pinned above the scroll so a safety alert and the hero timer can
          never scroll out of view. */}
      <View className="gap-4 px-4 pt-4">
        {alerts.length > 0 && <AlertBanner alert={alerts[0]} />}

        <View className="relative gap-2 overflow-hidden rounded-2xl border border-transparent bg-white p-4 shadow-sm dark:border-night-border dark:bg-night-elevated">
          <View className={`absolute inset-x-0 top-0 h-1 ${accentClass}`} />

          <View className="flex-row items-center gap-2">
            <View className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
            {currentMode && (
              <RNText
                className={`text-sm font-extrabold uppercase tracking-wide ${modeLabelClass}`}
              >
                {modeLabels[currentMode]}
              </RNText>
            )}
          </View>

          <View className="flex-row items-baseline justify-between">
            <Text variant="eyebrow">{t('workTimer.counters.sinceBreak')}</Text>
            <Text variant="caption">
              / {formatDuration(DRIVING_BEFORE_BREAK_MS)}
            </Text>
          </View>

          <Text variant="hero">
            {formatDuration(counters.drivingSinceBreak)}
          </Text>

          <Text variant="caption">
            {breakRemaining > 0
              ? t('workTimer.breakRemaining', {
                  time: formatDuration(breakRemaining),
                })
              : t('workTimer.breakRequired')}
          </Text>

          <ProgressBar
            value={counters.drivingSinceBreak}
            limit={DRIVING_BEFORE_BREAK_MS}
          />
        </View>
      </View>

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
