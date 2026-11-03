import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, TextInput, TouchableOpacity, View } from 'react-native';

import { DAILY_CHECK_NOTE_MAX_LENGTH } from '@/constants/dailyCheck';
import type { DailyCheckItem, DailyCheckItemPatch } from '@/db/types';
import { useAppTheme } from '@/hooks/useAppTheme';

import {
  CheckAction,
  CheckControl,
  DailyCheckIcon,
} from './DailyCheckControls';
import { Text } from './Text';

export function DailyCheckItemRow({
  item,
  title,
  expanded,
  disabled,
  onToggleDetails,
  onChange,
  onPhoto,
}: {
  item: DailyCheckItem;
  title: string;
  expanded: boolean;
  disabled: boolean;
  onToggleDetails: () => void;
  onChange: (patch: DailyCheckItemPatch) => void;
  onPhoto: (remove?: boolean) => void;
}) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [photoMissing, setPhotoMissing] = useState(false);
  const status = item.has_issue
    ? t(item.is_critical ? 'dailyCheck.criticalIssue' : 'dailyCheck.issue')
    : [
        t(item.checked ? 'dailyCheck.checked' : 'dailyCheck.unchecked'),
        item.note?.trim() ? t('dailyCheck.noteAdded') : '',
        item.photo_uri ? t('dailyCheck.photoAdded') : '',
      ]
        .filter(Boolean)
        .join(' · ');
  return (
    <View className="border-b border-line">
      <View className="flex-row items-stretch gap-1 pl-3 pr-1 py-2">
        <CheckControl
          checked={item.checked === 1}
          disabled={disabled}
          label={t('dailyCheck.checkItem', { item: title })}
          onPress={() => onChange({ checked: item.checked ? 0 : 1 })}
        >
          <Text className="font-semibold">{title}</Text>
          <Text
            variant="timestamp"
            tone={item.has_issue ? 'danger' : 'muted'}
            className="mt-1"
          >
            {status}
          </Text>
        </CheckControl>
        <TouchableOpacity
          disabled={disabled}
          onPress={onToggleDetails}
          accessibilityRole="button"
          accessibilityLabel={t('dailyCheck.itemDetails', { item: title })}
          accessibilityState={{ expanded, disabled }}
          className={`min-h-14 min-w-14 items-center justify-center gap-1 rounded-lg px-1 ${expanded ? 'bg-surface-control' : ''}`}
        >
          <DailyCheckIcon
            name="note-text-outline"
            size={24}
            className="text-ink-muted"
          />
          <Text variant="timestamp">{t('dailyCheck.details')}</Text>
        </TouchableOpacity>
      </View>
      {expanded && (
        <View className="gap-3 px-4 pb-4">
          <View className="gap-2">
            <Text variant="caption">{t('dailyCheck.note')}</Text>
            <TextInput
              accessibilityLabel={t('dailyCheck.note')}
              value={item.note ?? ''}
              editable={!disabled}
              multiline
              maxLength={DAILY_CHECK_NOTE_MAX_LENGTH}
              onChangeText={(note) => onChange({ note })}
              placeholder={t('dailyCheck.notePlaceholder')}
              placeholderTextColor={theme.colors.muted}
              textAlignVertical="top"
              className="min-h-24 rounded-xl border border-line-control bg-surface-raised p-3 text-base text-ink"
            />
          </View>
          <CheckControl
            label={t('dailyCheck.reportIssue')}
            checked={item.has_issue === 1}
            disabled={disabled}
            onPress={() => onChange({ has_issue: item.has_issue ? 0 : 1 })}
          >
            <Text>{t('dailyCheck.reportIssue')}</Text>
          </CheckControl>
          {!!item.has_issue && (
            <CheckControl
              label={t('dailyCheck.markCritical')}
              checked={item.is_critical === 1}
              disabled={disabled}
              onPress={() =>
                onChange({ is_critical: item.is_critical ? 0 : 1 })
              }
            >
              <Text>{t('dailyCheck.markCritical')}</Text>
            </CheckControl>
          )}
          {!!item.is_critical && (
            <View className="rounded-xl bg-danger-surface p-3">
              <Text tone="danger" variant="caption">
                {t('dailyCheck.criticalNotice')}
              </Text>
            </View>
          )}
          {item.photo_uri ? (
            <View className="gap-3">
              <Image
                source={{ uri: item.photo_uri }}
                accessibilityLabel={t('dailyCheck.photoAlt', { item: title })}
                className="h-24 w-24 rounded-lg"
                onError={() => setPhotoMissing(true)}
                onLoad={() => setPhotoMissing(false)}
              />
              {photoMissing && (
                <Text tone="danger" variant="caption">
                  {t('dailyCheck.photoMissing')}
                </Text>
              )}
              <CheckAction disabled={disabled} onPress={() => onPhoto(true)}>
                {t('dailyCheck.removePhoto')}
              </CheckAction>
            </View>
          ) : (
            <CheckAction disabled={disabled} onPress={() => onPhoto()}>
              {t('dailyCheck.addPhoto')}
            </CheckAction>
          )}
        </View>
      )}
    </View>
  );
}
