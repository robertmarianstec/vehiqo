import { MaterialCommunityIcons } from '@expo/vector-icons';
import { styled } from 'nativewind';
import { Text, TouchableOpacity } from 'react-native';

import { MODE_COLORS } from '@/constants/modeColors';
import type { WorkMode } from '@/db/types';

interface ModeButtonProps {
  mode: WorkMode;
  label: string;
  selected: boolean;
  onPress: () => void;
}

// styled() lets the icon take its color from a NativeWind class, so no color is
// hardcoded outside global.css.
const Icon = styled(MaterialCommunityIcons);

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

// Color is reserved for the mode the driver is actually in; five colored
// buttons at once would compete with that signal.
const idleSurface =
  'bg-gray-100 dark:bg-night-elevated border-gray-300 dark:border-night-border';
const idleContent = 'text-gray-500 dark:text-ink-muted';
const selectedContent = 'text-gray-900 dark:text-ink';

const modeIcon: Record<WorkMode, IconName> = {
  driving: 'truck-outline',
  other_work: 'wrench-outline',
  standby: 'eye-outline',
  break: 'coffee-outline',
  rest: 'bed-outline',
};

export function ModeButton({
  mode,
  label,
  selected,
  onPress,
}: ModeButtonProps) {
  const colors = MODE_COLORS[mode];
  const color = selected ? selectedContent : idleContent;
  const surface = selected ? `${colors.tint} ${colors.border}` : idleSurface;
  return (
    <TouchableOpacity
      className={`h-16 flex-1 flex-row items-center justify-center gap-2 rounded-2xl border-2 px-2 ${surface}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Icon name={modeIcon[mode]} size={20} className={color} />
      <Text className={`text-base font-extrabold uppercase ${color}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
