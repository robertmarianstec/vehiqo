import { MaterialCommunityIcons } from '@expo/vector-icons';
import { styled } from 'nativewind';
import type { ComponentProps, ReactNode } from 'react';
import { TouchableOpacity, View } from 'react-native';

import { Text } from './Text';

const StyledIcon = styled(MaterialCommunityIcons);

export function DailyCheckIcon(props: ComponentProps<typeof StyledIcon>) {
  return (
    <StyledIcon
      {...props}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export function CheckControl({
  checked,
  onPress,
  disabled,
  children,
  label,
}: {
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
  label?: string;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-12 flex-1 flex-row items-center gap-3 py-2"
    >
      <DailyCheckIcon
        name={checked ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
        size={28}
        className={checked ? 'text-brand' : 'text-ink-muted'}
      />
      <View className="flex-1">{children}</View>
    </TouchableOpacity>
  );
}

export function CheckAction({
  onPress,
  disabled,
  children,
  primary = false,
  label,
}: {
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
  primary?: boolean;
  label?: string;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 flex-row items-center justify-center gap-2 rounded-xl border px-4 py-3 ${primary && !disabled ? 'border-brand bg-brand' : 'border-line-control bg-surface-control'}`}
    >
      <Text
        className={`text-center font-semibold ${primary && !disabled ? 'text-on-brand' : disabled ? 'text-ink-muted' : 'text-ink'}`}
      >
        {children}
      </Text>
    </TouchableOpacity>
  );
}
