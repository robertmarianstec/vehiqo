import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlobalPinnedHeader } from '@/components';
import { useAppTheme } from '@/hooks/useAppTheme';
import { WorkTimerProvider } from '@/hooks/WorkTimerProvider';

// Tab bar sizing props are plain numbers, not NativeWind classes, so the icon,
// label, and bar height are scaled in JS here. Floors keep the current phone
// look; the cap only grows the bar on large screens.
function clampNum(min: number, preferred: number, max: number): number {
  return Math.min(Math.max(preferred, min), max);
}

export default function TabLayout() {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();

  const iconSize = Math.round(
    clampNum(24, Math.min(width * 0.06, height * 0.04), 32),
  );
  const labelFontSize = Math.round(iconSize * (10 / 24));
  // @react-navigation's icon wrapper is a fixed 31×28 box — grow it or the glyph
  // bleeds into the label. Never use tabBarItemStyle padding: it sits outside the
  // pressable, inflating the item past the bar height and clipping the label.
  const iconBoxHeight = iconSize + 4;
  const barContentHeight = Math.round(
    clampNum(49, iconBoxHeight + labelFontSize * 1.2 + 10, 68),
  );

  return (
    <WorkTimerProvider>
      <View className="flex-1 bg-canvas">
        <GlobalPinnedHeader />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor: theme.colors.muted,
            // Force icon-above-label. The library otherwise switches to
            // labels-beside-icons whenever the tab area is wider than tall,
            // which a short screen hits once the pinned header takes its space.
            tabBarLabelPosition: 'below-icon',
            tabBarLabelStyle: { fontSize: labelFontSize },
            tabBarIconStyle: { width: iconSize, height: iconBoxHeight },
            tabBarStyle: { height: barContentHeight + insets.bottom },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: t('tabs.timer'),
              tabBarIcon: ({ color }) => (
                <MaterialCommunityIcons
                  name="clock-outline"
                  size={iconSize}
                  color={
                    typeof color === 'number' ? undefined : (color ?? undefined)
                  }
                />
              ),
            }}
          />
          <Tabs.Screen
            name="daily-check"
            options={{
              title: t('tabs.dailyCheck'),
              tabBarIcon: ({ color }) => (
                <MaterialCommunityIcons
                  name="clipboard-check-outline"
                  size={iconSize}
                  color={
                    typeof color === 'number' ? undefined : (color ?? undefined)
                  }
                />
              ),
            }}
          />
          <Tabs.Screen
            name="map"
            options={{
              title: t('tabs.map'),
              tabBarIcon: ({ color }) => (
                <MaterialCommunityIcons
                  name="map-outline"
                  size={iconSize}
                  color={
                    typeof color === 'number' ? undefined : (color ?? undefined)
                  }
                />
              ),
            }}
          />
          <Tabs.Screen
            name="fatigue"
            options={{
              title: t('tabs.fatigue'),
              tabBarIcon: ({ color }) => (
                <MaterialCommunityIcons
                  name="head-alert-outline"
                  size={iconSize}
                  color={
                    typeof color === 'number' ? undefined : (color ?? undefined)
                  }
                />
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: t('tabs.settings'),
              tabBarIcon: ({ color }) => (
                <MaterialCommunityIcons
                  name="cog-outline"
                  size={iconSize}
                  color={
                    typeof color === 'number' ? undefined : (color ?? undefined)
                  }
                />
              ),
            }}
          />
        </Tabs>
      </View>
    </WorkTimerProvider>
  );
}
