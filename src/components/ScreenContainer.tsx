import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenContainerProps {
  children: React.ReactNode;
  /** Extra classes for the inner column. */
  className?: string;
}

// Shared screen shell: background, safe-area insets, and a centered max-width
// column so large screens (tablets, 2-in-1s) get a readable column instead of
// full-width-stretched controls. Screens using this always render below the
// GlobalPinnedHeader, which owns the top inset — so the top edge is omitted
// here to avoid padding it twice.
export function ScreenContainer({ children, className }: ScreenContainerProps) {
  return (
    <View className="flex-1 bg-gray-50 dark:bg-night">
      <SafeAreaView style={{ flex: 1 }} edges={['right', 'bottom', 'left']}>
        <View
          className={`w-full max-w-2xl flex-1 self-center ${className ?? ''}`}
        >
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}
