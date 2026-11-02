import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Card, ScreenContainer, Text } from '@/components';

const NOT_TRACKED_KEYS = [
  'limitations.reducedRests',
  'limitations.dailyRestWindow',
  'limitations.weeklyRestDeadline',
  'limitations.weeklyCompensation',
  'limitations.multiManning',
  'limitations.ferry',
] as const;

const ASSUMPTION_KEYS = [
  'limitations.extensionsFromRests',
  'limitations.straddlingWeek',
  'limitations.noRestOnRecord',
] as const;

export default function LimitationsScreen() {
  const { t } = useTranslation();

  return (
    <ScreenContainer>
      <ScrollView contentContainerClassName="px-4 py-4 gap-4">
        <Text variant="body">{t('limitations.intro')}</Text>

        <Card className="gap-3">
          <Text variant="eyebrow">{t('limitations.listTitle')}</Text>
          {NOT_TRACKED_KEYS.map((key) => (
            <View key={key} className="flex-row gap-2">
              <Text variant="body" tone="muted">
                •
              </Text>
              <Text variant="body" className="flex-1">
                {t(key)}
              </Text>
            </View>
          ))}
        </Card>

        <Card className="gap-3">
          <Text variant="eyebrow">{t('limitations.assumptionsTitle')}</Text>
          {ASSUMPTION_KEYS.map((key) => (
            <View key={key} className="flex-row gap-2">
              <Text variant="body" tone="muted">
                •
              </Text>
              <Text variant="body" className="flex-1">
                {t(key)}
              </Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}
