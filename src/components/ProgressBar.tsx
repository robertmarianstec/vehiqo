import { View } from 'react-native';

import { getWarningLevel, type WarningLevel } from '@/utils/compliance';

interface ProgressBarProps {
  value: number;
  limit: number;
}

// Only the two levels the alert system also paints get a color here: amber from
// 90%, red at the limit. The informational 75% level is carried by the banner's
// message instead — an amber fill through the last quarter of every driving
// stint would wear out what amber means.
const fillColor: Partial<Record<WarningLevel, string>> = {
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export function ProgressBar({ value, limit }: ProgressBarProps) {
  const level = getWarningLevel(value, limit);
  const pct = Math.max(0, Math.min(100, (value / limit) * 100));
  const color = (level && fillColor[level]) ?? 'bg-driving';
  return (
    <View className="h-1.5 w-full overflow-hidden rounded-full bg-track">
      <View
        className={`h-full rounded-full ${color}`}
        style={{ width: `${pct}%` }}
      />
    </View>
  );
}
