import { usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlertBanner } from '@/components/AlertBanner';
import { ProgressBar } from '@/components/ProgressBar';
import { Text } from '@/components/Text';
import { DRIVING_BEFORE_BREAK_MS } from '@/constants/euRegulations';
import { MODE_COLORS } from '@/constants/modeColors';
import type { WorkMode } from '@/db/types';
import { useDangerVibration } from '@/hooks/useDangerVibration';
import { useWorkTimerContext } from '@/hooks/WorkTimerProvider';
import { formatDuration } from '@/utils/format';

// Pinned above the tab bar so a safety alert and the driving-since-break timer
// stay visible and active on every tab. The Timer tab gets the full hero; the
// other tabs get a compact strip so the counter never dominates their content.
export function GlobalPinnedHeader() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { currentMode, counters, alerts } = useWorkTimerContext();

  useDangerVibration(alerts);

  const isTimerTab = pathname === '/';

  const elapsedToMinute =
    Math.floor(counters.drivingSinceBreak / 60_000) * 60_000;
  const breakRemaining = DRIVING_BEFORE_BREAK_MS - elapsedToMinute;

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

  const modeIndicator = (
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
  );

  return (
    // Topmost element on screen, so it owns the top safe-area inset; the
    // screens below (ScreenContainer) omit their top edge to avoid doubling it.
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="bg-gray-50 dark:bg-night"
    >
      <View className="gap-4 px-4 pt-2">
        {isTimerTab && (
          <View className="flex-row items-center justify-between">
            <View className="gap-1.5">
              {/* Static placeholder — country selection (module 5) isn't built
                  yet, so this isn't tappable. No chevron: a dropdown affordance
                  would falsely suggest it already does something. */}
              <View className="self-start rounded-lg border border-gray-300 bg-gray-100 px-2 py-1 dark:border-night-border dark:bg-night-elevated">
                <RNText className="text-xs font-bold tracking-wide text-gray-500 dark:text-ink-muted">
                  PL
                </RNText>
              </View>

              <View className="flex-row items-center gap-1.5">
                <View className="h-1.5 w-1.5 rounded-full bg-success" />
                <RNText className="text-xs font-semibold uppercase tracking-wide text-success">
                  {t('header.offline')}
                </RNText>
              </View>
            </View>

            {/* Right slot reserved for the panic button — not built yet, so it
                stays empty rather than showing a dead safety control. */}
          </View>
        )}

        {alerts.length > 0 && <AlertBanner alert={alerts[0]} />}

        {isTimerTab ? (
          <View className="relative gap-2 overflow-hidden rounded-2xl border border-transparent bg-white p-4 shadow-sm dark:border-night-border dark:bg-night-elevated">
            <View className={`absolute inset-x-0 top-0 h-1 ${accentClass}`} />

            {modeIndicator}

            <View className="flex-row items-baseline justify-between">
              <Text variant="eyebrow">
                {t('workTimer.counters.sinceBreak')}
              </Text>
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
        ) : (
          <View className="relative gap-2 overflow-hidden rounded-2xl border border-transparent bg-white p-3 shadow-sm dark:border-night-border dark:bg-night-elevated">
            <View className={`absolute inset-x-0 top-0 h-1 ${accentClass}`} />

            <View className="flex-row items-center justify-between">
              {modeIndicator}

              <View className="flex-row items-baseline gap-1">
                <Text variant="heading">
                  {formatDuration(counters.drivingSinceBreak)}
                </Text>
                <Text variant="caption">
                  / {formatDuration(DRIVING_BEFORE_BREAK_MS)}
                </Text>
              </View>
            </View>

            <ProgressBar
              value={counters.drivingSinceBreak}
              limit={DRIVING_BEFORE_BREAK_MS}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
