import { MaterialCommunityIcons } from '@expo/vector-icons';
import { styled } from 'nativewind';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Text } from '@/components/Text';
import type { AlertSeverity, TimerAlert } from '@/utils/workTimerAlerts';

interface AlertBannerProps {
  alert: TimerAlert;
}

const Icon = styled(MaterialCommunityIcons);

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const severityStyle: Record<
  AlertSeverity,
  {
    wrap: string;
    badge: string;
    badgeText: string;
    icon: IconName;
  }
> = {
  info: {
    wrap: 'bg-info-surface border border-info-line',
    badge: 'bg-info-badge',
    badgeText: 'text-info-icon',
    icon: 'information-outline',
  },
  warning: {
    wrap: 'bg-warning-surface border border-warning-line',
    badge: 'bg-warning-badge',
    badgeText: 'text-warning-icon',
    icon: 'alert-outline',
  },
  danger: {
    wrap: 'bg-danger-surface border border-danger-line',
    badge: 'bg-danger-badge',
    badgeText: 'text-danger-icon',
    icon: 'alert-octagon-outline',
  },
};

export function AlertBanner({ alert }: AlertBannerProps) {
  const { t } = useTranslation();
  const s = severityStyle[alert.severity];
  const message = t(alert.messageKey, {
    percent: alert.percent,
    used: alert.used,
  });

  return (
    // The label is spelled out because the badge renders its icon as a glyph
    // character; without it a screen reader would read that glyph before the
    // message.
    <View
      className={`flex-row items-center gap-3 rounded-2xl p-3 ${s.wrap}`}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={message}
    >
      <View
        className={`w-7 h-7 rounded-lg items-center justify-center ${s.badge}`}
      >
        <Icon name={s.icon} size={16} className={s.badgeText} />
      </View>
      <Text tone={alert.severity} className="flex-1 font-medium">
        {message}
      </Text>
    </View>
  );
}
