import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { MODE_COLORS } from '@/constants/modeColors';
import type { DayBounds, DaySegment } from '@/utils/dayTimeline';

import { Card } from './Card';
import { Text } from './Text';

interface DayTimelineBarProps {
  segments: DaySegment[];
  bounds: DayBounds;
  compact?: boolean;
  headerAction?: ReactNode;
}

const HOUR_MARKS = [0, 6, 12, 18, 24];

export function DayTimelineBar({
  segments,
  bounds,
  compact = false,
  headerAction,
}: DayTimelineBarProps) {
  const { t } = useTranslation();
  const dayLengthMs = bounds.dayEnd - bounds.dayStart;

  return (
    <Card compact={compact} className={compact ? 'gap-1' : 'gap-2'}>
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="eyebrow" className="shrink">
          {t('workTimer.dayTimeline.title')}
        </Text>
        {headerAction}
      </View>

      {/* Segments are absolutely positioned by percentage (not flex-row) so
          gaps in the data — periods with no logged session — correctly show
          as empty background instead of being squeezed out. */}
      <View className="relative h-6 overflow-hidden rounded-lg bg-track">
        {segments.map((segment, index) => (
          <View
            key={index}
            className={`absolute inset-y-0 ${MODE_COLORS[segment.mode].bg}`}
            style={{
              left: `${((segment.start - bounds.dayStart) / dayLengthMs) * 100}%`,
              width: `${((segment.end - segment.start) / dayLengthMs) * 100}%`,
            }}
          />
        ))}
      </View>

      <View className="relative flex-row justify-between">
        {HOUR_MARKS.map((hour) => {
          const mark = new Date(bounds.dayStart);
          mark.setHours(hour, 0, 0, 0);
          const isEdge = hour === 0 || hour === 24;

          return (
            <Text
              key={hour}
              variant="timestamp"
              style={
                isEdge
                  ? undefined
                  : {
                      position: 'absolute',
                      top: 0,
                      left: `${((mark.getTime() - bounds.dayStart) / dayLengthMs) * 100}%`,
                      transform: [{ translateX: '-50%' }],
                    }
              }
            >
              {String(hour).padStart(2, '0')}
            </Text>
          );
        })}
      </View>
    </Card>
  );
}
