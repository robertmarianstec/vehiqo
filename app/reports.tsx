import { MaterialCommunityIcons } from '@expo/vector-icons';
import { styled } from 'nativewind';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, TouchableOpacity, View } from 'react-native';

import { Card, ScreenContainer, Text } from '@/components';
import type { WorkMode } from '@/db/types';
import { useWorkReport } from '@/hooks/useWorkReport';
import { useWorkReportPdf } from '@/hooks/useWorkReportPdf';
import { getDayBounds } from '@/utils/dayTimeline';
import { formatDuration } from '@/utils/format';
import { getWorkReportTotals } from '@/utils/workReport';

const Icon = styled(MaterialCommunityIcons);
const MODES = [
  { mode: 'driving', icon: 'truck-outline' },
  { mode: 'other_work', icon: 'wrench-outline' },
  { mode: 'standby', icon: 'eye-outline' },
  { mode: 'break', icon: 'coffee-outline' },
  { mode: 'rest', icon: 'bed-outline' },
] as const;

function ModeTotals({
  durations,
  skipDriving = false,
}: {
  durations: Record<WorkMode, number>;
  skipDriving?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row flex-wrap gap-y-3">
      {MODES.filter(({ mode }) => !skipDriving || mode !== 'driving').map(
        ({ mode, icon }) => (
          <View key={mode} className="w-1/2 gap-1 pr-2">
            <View className="flex-row items-center gap-1">
              <Icon name={icon} size={16} className="text-ink-muted" />
              <Text variant="timestamp" className="shrink">
                {t(`workTimer.modes.${mode}`)}
              </Text>
            </View>
            <Text variant="label" className="font-bold">
              {formatDuration(durations[mode])}
            </Text>
          </View>
        ),
      )}
    </View>
  );
}

export default function ReportsScreen() {
  const { t, i18n } = useTranslation();
  const {
    period,
    range,
    report,
    isLoading,
    error,
    canMoveForward,
    selectPeriod,
    movePeriod,
    reload,
  } = useWorkReport();
  const { isExporting, exportReport } = useWorkReportPdf();
  const [openedDay, setOpenedDay] = useState<number | null>(null);
  const totals = useMemo(
    () => getWorkReportTotals(report?.days ?? []),
    [report],
  );
  const hasRecords = Object.values(totals.durations).some((time) => time > 0);
  const date = (time: number, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, options).format(time);
  const rangeLabel =
    period === 'month'
      ? date(range.from, { month: 'long', year: 'numeric' })
      : `${date(range.from, { day: 'numeric', month: 'short' })} – ${date(range.to - 1, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const pending = isLoading || (!report && !error);

  return (
    <ScreenContainer>
      <FlatList
        testID="report-days"
        data={pending || error || !hasRecords ? [] : report?.days}
        keyExtractor={(day) => String(day.dayStart)}
        extraData={openedDay}
        refreshing={isLoading}
        onRefresh={reload}
        contentContainerClassName="px-4 py-4 gap-2"
        ListHeaderComponent={
          <View className="gap-4 pb-2">
            <View className="flex-row gap-1 rounded-xl bg-surface-control p-1">
              {(['week', 'month'] as const).map((value) => (
                <TouchableOpacity
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: period === value,
                    disabled: isExporting,
                  }}
                  disabled={isExporting}
                  className={`min-h-12 flex-1 items-center justify-center rounded-lg p-2 ${period === value ? 'bg-surface-raised' : ''}`}
                  onPress={() => {
                    setOpenedDay(null);
                    selectPeriod(value);
                  }}
                >
                  <Text
                    className={
                      period === value
                        ? 'font-bold text-brand'
                        : 'text-ink-muted'
                    }
                  >
                    {t(`reports.period.${value}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('reports.previous')}
                accessibilityState={{ disabled: isExporting }}
                disabled={isExporting}
                onPress={() => {
                  setOpenedDay(null);
                  movePeriod(-1);
                }}
                className="min-h-12 min-w-12 items-center justify-center rounded-xl border border-line-control bg-surface-control"
              >
                <Icon
                  name="chevron-left"
                  size={22}
                  className="text-ink-muted"
                />
              </TouchableOpacity>
              <View className="flex-1">
                <Text className="text-center font-bold">{rangeLabel}</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('reports.next')}
                accessibilityState={{
                  disabled: !canMoveForward || isExporting,
                }}
                disabled={!canMoveForward || isExporting}
                onPress={() => {
                  setOpenedDay(null);
                  movePeriod(1);
                }}
                className={`min-h-12 min-w-12 items-center justify-center rounded-xl border border-line-control bg-surface-control ${!canMoveForward ? 'opacity-40' : ''}`}
              >
                <Icon
                  name="chevron-right"
                  size={22}
                  className="text-ink-muted"
                />
              </TouchableOpacity>
            </View>
            {pending ? (
              <Text>{t('common.loading')}</Text>
            ) : error ? (
              <View className="gap-3">
                <Text tone="danger" accessibilityRole="alert">
                  {t('reports.loadError')}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={reload}
                  className="items-center rounded-xl border border-line-control bg-surface-control p-4"
                >
                  <Text>{t('common.retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              report && (
                <>
                  <Text variant="timestamp" className="text-center">
                    {t('reports.asOf', {
                      date: date(report.asOf, {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    })}
                  </Text>
                  {hasRecords ? (
                    <>
                      <Card className="gap-4">
                        <Text variant="eyebrow">{t('reports.total')}</Text>
                        <View className="flex-row flex-wrap items-baseline justify-between gap-2">
                          <View className="flex-row items-center gap-2">
                            <Icon
                              name="truck-outline"
                              size={22}
                              className="text-driving-ink"
                            />
                            <Text className="font-bold text-driving-ink">
                              {t('workTimer.modes.driving')}
                            </Text>
                          </View>
                          <Text variant="display" className="font-bold">
                            {formatDuration(totals.durations.driving)}
                          </Text>
                        </View>
                        <ModeTotals durations={totals.durations} skipDriving />
                      </Card>
                      {totals.unrecorded > 0 && (
                        <View className="flex-row flex-wrap justify-between gap-2 rounded-xl bg-warning-surface p-3">
                          <Text tone="warning">{t('reports.unrecorded')}</Text>
                          <Text tone="warning" className="font-bold">
                            {formatDuration(totals.unrecorded)}
                          </Text>
                        </View>
                      )}
                      <Text variant="eyebrow">{t('reports.days')}</Text>
                    </>
                  ) : (
                    <Card className="gap-2">
                      <Text className="font-bold">{t('reports.empty')}</Text>
                      <Text variant="caption">
                        {t('reports.emptyDescription')}
                      </Text>
                    </Card>
                  )}
                </>
              )
            )}
          </View>
        }
        renderItem={({ item }) => {
          const expanded = openedDay === item.dayStart;
          const label = date(item.dayStart, {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
          });
          return (
            <View className="overflow-hidden rounded-xl border border-line bg-surface">
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ expanded }}
                onPress={() => setOpenedDay(expanded ? null : item.dayStart)}
                className="min-h-14 flex-row items-center justify-between gap-2 p-3"
              >
                <Text className="flex-1 font-bold">{label}</Text>
                {!expanded && (
                  <View className="items-end">
                    <Text variant="timestamp">
                      {t('workTimer.modes.driving')}
                    </Text>
                    <Text className="font-bold">
                      {formatDuration(item.durations.driving)}
                    </Text>
                  </View>
                )}
                <Icon
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  className="text-ink-muted"
                />
              </TouchableOpacity>
              {expanded && (
                <View className="gap-3 border-t border-line p-3">
                  <ModeTotals durations={item.durations} />
                  <View className="flex-row flex-wrap justify-between gap-2">
                    <Text variant="timestamp">{t('reports.unrecorded')}</Text>
                    <Text variant="timestamp">
                      {formatDuration(item.unrecorded)}
                    </Text>
                  </View>
                  {item.to < getDayBounds(item.dayStart).dayEnd ? (
                    <Text variant="timestamp">
                      {t('reports.partialDay', {
                        time: date(item.to, {
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                      })}
                    </Text>
                  ) : (
                    item.to - item.from !== 86_400_000 && (
                      <Text variant="timestamp">
                        {t('reports.dayLength', {
                          time: formatDuration(item.to - item.from),
                        })}
                      </Text>
                    )
                  )}
                </View>
              )}
            </View>
          );
        }}
      />
      <View className="gap-3 border-t border-line px-4 py-3">
        <Text variant="timestamp">{t('reports.disclaimer')}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t(
            isExporting ? 'reports.pdf.creating' : 'reports.pdf.create',
          )}
          accessibilityState={{
            disabled: pending || error || !hasRecords || isExporting,
            busy: isExporting,
          }}
          disabled={pending || error || !hasRecords || isExporting}
          onPress={() => {
            if (report) void exportReport(report, period);
          }}
          className={`min-h-12 flex-row items-center justify-center gap-2 rounded-xl border border-line-control bg-surface-control p-3 ${pending || error || !hasRecords || isExporting ? 'opacity-40' : ''}`}
        >
          <Icon name="file-document-outline" size={20} className="text-brand" />
          <Text className="font-bold text-brand">
            {t(isExporting ? 'reports.pdf.creating' : 'reports.pdf.create')}
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
