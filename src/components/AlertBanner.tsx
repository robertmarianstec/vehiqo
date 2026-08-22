import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Text } from '@/components/Text';
import type { AlertSeverity, TimerAlert } from '@/utils/workTimerAlerts';

interface AlertBannerProps {
  alert: TimerAlert;
}

const severityStyle: Record<
  AlertSeverity,
  { wrap: string; badge: string; badgeText: string; text: string; icon: string }
> = {
  info: {
    wrap: 'bg-info/10 border border-info/30',
    badge: 'bg-info/30',
    badgeText: 'text-info',
    text: 'text-info',
    icon: 'i',
  },
  warning: {
    wrap: 'bg-warning/10 border border-warning/30',
    badge: 'bg-warning',
    badgeText: 'text-night',
    text: 'text-warning',
    icon: '!',
  },
  danger: {
    wrap: 'bg-danger/10 border border-danger/30',
    badge: 'bg-danger',
    badgeText: 'text-white',
    text: 'text-danger',
    icon: '!',
  },
};

export function AlertBanner({ alert }: AlertBannerProps) {
  const { t } = useTranslation();
  const s = severityStyle[alert.severity];

  return (
    <View
      className={`flex-row items-center gap-3 rounded-2xl p-3 ${s.wrap}`}
      accessibilityRole="alert"
    >
      <View
        className={`w-7 h-7 rounded-lg items-center justify-center ${s.badge}`}
      >
        <Text className={`font-bold ${s.badgeText}`}>{s.icon}</Text>
      </View>
      <Text className={`flex-1 font-medium ${s.text}`}>
        {t(alert.messageKey, { percent: alert.percent, used: alert.used })}
      </Text>
    </View>
  );
}
