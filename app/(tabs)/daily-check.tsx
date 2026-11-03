import { type ComponentRef, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Card, ScreenContainer, Text } from '@/components';
import {
  CheckAction,
  CheckControl,
  DailyCheckIcon,
} from '@/components/DailyCheckControls';
import { DailyCheckItemRow } from '@/components/DailyCheckItemRow';
import { DRIVER_NAME_MAX_LENGTH, TRAILER_TYPES } from '@/constants/dailyCheck';
import type { DailyCheckItem, VehicleType } from '@/db/types';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useDailyCheck } from '@/hooks/useDailyCheck';
import { useDailyCheckPdf } from '@/hooks/useDailyCheckPdf';
import { getDailyCheckItemTitle } from '@/utils/dailyCheck';

export default function DailyCheckScreen() {
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const model = useDailyCheck();
  const { isExporting, exportCheck } = useDailyCheckPdf();
  const { record, vehicle, isLoading, loadError, isBusy, saveError, isSaving } =
    model;
  const [page, setPage] = useState<'list' | 'summary'>('list');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [typePicker, setTypePicker] = useState(false);
  type Confirmation = {
    id: string | undefined;
    name: string | null;
    confirmed: boolean;
    validation: 'nameRequired' | 'confirmationRequired' | null;
  };
  const [confirmation, setConfirmation] = useState<Confirmation>({
    id: undefined,
    name: null,
    confirmed: false,
    validation: null,
  });
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const nameInput = useRef<ComponentRef<typeof TextInput>>(null);
  const checkId = record?.check.id;
  const activeConfirmation = confirmation.id === checkId ? confirmation : null;
  const name = activeConfirmation?.name ?? model.driverName;
  const confirmed = activeConfirmation?.confirmed ?? false;
  const validation = activeConfirmation?.validation ?? null;
  function updateConfirmation(patch: Partial<Confirmation>) {
    setConfirmation((previous) => ({
      ...(previous.id === checkId
        ? previous
        : { name: null, confirmed: false, validation: null }),
      ...patch,
      id: checkId,
    }));
  }
  function setName(name: string) {
    updateConfirmation({ name });
  }
  function setConfirmed(value: boolean | ((previous: boolean) => boolean)) {
    updateConfirmation({
      confirmed: typeof value === 'function' ? value(confirmed) : value,
    });
  }
  function setValidation(validation: Confirmation['validation']) {
    updateConfirmation({ validation });
  }
  const completed = record?.check.completed_at !== null && !!record;
  const disabled = isBusy || saveError || isLoading || isExporting;
  const checked = record?.items.filter((item) => item.checked).length ?? 0;
  const missing = record?.items.filter((item) => !item.checked) ?? [];
  const issues = record?.items.filter((item) => item.has_issue) ?? [];
  const critical = issues.filter((item) => item.is_critical);
  const observations =
    record?.items.filter(
      (item) => item.note?.trim() || item.has_issue || item.photo_uri,
    ) ?? [];
  const title = (item: DailyCheckItem) =>
    getDailyCheckItemTitle(t, record!.check, item);
  const date = (value: number, time = false) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      ...(time ? ({ hour: '2-digit', minute: '2-digit' } as const) : {}),
    }).format(value);
  function move(next: 'list' | 'summary') {
    Keyboard.dismiss();
    setPage(next);
    setValidation(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  async function select(next: VehicleType) {
    if (await model.selectVehicle(next)) {
      setExpanded(null);
      setTypePicker(false);
      move('list');
    }
  }
  async function primary() {
    if (!record) return;
    if (completed) {
      await select(vehicle === 'tractor' ? 'trailer' : 'tractor');
      return;
    }
    if (page === 'list') {
      if (await model.flush()) move('summary');
      return;
    }
    if (missing.length) {
      move('list');
      return;
    }
    if (!name.trim() || !confirmed) {
      setValidation(!name.trim() ? 'nameRequired' : 'confirmationRequired');
      if (!name.trim()) nameInput.current?.focus();
      return;
    }
    if (await model.finish(name, confirmed)) {
      Keyboard.dismiss();
      scroll.current?.scrollTo({ y: 0, animated: false });
    }
  }
  const primaryLabel = completed
    ? t(
        vehicle === 'tractor'
          ? 'dailyCheck.nextTrailer'
          : 'dailyCheck.nextTractor',
      )
    : page === 'list'
      ? t('dailyCheck.summary')
      : missing.length
        ? t('dailyCheck.returnToMissing')
        : t('dailyCheck.save');

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-4 px-4 py-4"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {isLoading ? (
            <Text>{t('common.loading')}</Text>
          ) : loadError || !record ? (
            <View className="gap-3">
              <Text tone="danger" accessibilityRole="alert">
                {t('dailyCheck.loadError')}
              </Text>
              <CheckAction
                disabled={isBusy}
                onPress={() => {
                  void model.retryLoad();
                }}
              >
                {t('common.retry')}
              </CheckAction>
            </View>
          ) : (
            <>
              {page === 'summary' && !completed && (
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => move('list')}
                  className="min-h-12 flex-row items-center gap-2"
                >
                  <DailyCheckIcon
                    name="arrow-left"
                    size={22}
                    className="text-brand"
                  />
                  <Text className="text-brand">{t('dailyCheck.back')}</Text>
                </TouchableOpacity>
              )}
              <View className="gap-1">
                {completed && (
                  <DailyCheckIcon
                    name="clipboard-check-outline"
                    size={44}
                    className="mb-2 text-info-ink"
                  />
                )}
                <Text variant="heading">
                  {t(
                    completed
                      ? 'dailyCheck.saved'
                      : page === 'summary'
                        ? 'dailyCheck.summary'
                        : 'dailyCheck.title',
                  )}
                </Text>
                <Text variant="caption">
                  {completed || page === 'summary'
                    ? `${t(`dailyCheck.vehicles.${vehicle}`)} · `
                    : ''}
                  {date(
                    record.check.completed_at ?? record.check.started_at,
                    completed,
                  )}
                </Text>
              </View>
              {saveError && (
                <View className="gap-3 rounded-xl bg-danger-surface p-3">
                  <Text tone="danger" accessibilityRole="alert">
                    {t('dailyCheck.saveError')}
                  </Text>
                  <CheckAction
                    disabled={isBusy}
                    onPress={() => {
                      void model.retrySave();
                    }}
                  >
                    {t('common.retry')}
                  </CheckAction>
                </View>
              )}
              {model.actionError && (
                <Text tone="danger" accessibilityRole="alert">
                  {t('dailyCheck.actionError')}
                </Text>
              )}
              {model.photoError && (
                <Text tone="danger" accessibilityRole="alert">
                  {t('dailyCheck.photoError')}
                </Text>
              )}
              {!completed && page === 'list' ? (
                <>
                  <View className="flex-row gap-1 rounded-xl bg-surface-control p-1">
                    {(['tractor', 'trailer'] as const).map((value) => (
                      <TouchableOpacity
                        key={value}
                        accessibilityRole="button"
                        accessibilityLabel={t(`dailyCheck.vehicles.${value}`)}
                        accessibilityState={{
                          selected: vehicle === value,
                          disabled,
                        }}
                        disabled={disabled}
                        onPress={() => {
                          void select(value);
                        }}
                        className={`min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-lg px-2 py-3 ${vehicle === value ? 'border border-line-control bg-surface-raised' : ''}`}
                      >
                        <DailyCheckIcon
                          name={
                            value === 'tractor'
                              ? 'truck-outline'
                              : 'truck-trailer'
                          }
                          size={24}
                          className={
                            vehicle === value ? 'text-brand' : 'text-ink-muted'
                          }
                        />
                        <Text
                          className={
                            vehicle === value
                              ? 'font-semibold text-brand'
                              : 'text-ink-muted'
                          }
                        >
                          {t(`dailyCheck.vehicles.${value}`)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {vehicle === 'trailer' && (
                    <View className="gap-2">
                      <Text variant="caption">
                        {t('dailyCheck.trailerType')}
                      </Text>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={t('dailyCheck.trailerType')}
                        accessibilityState={{ expanded: typePicker, disabled }}
                        disabled={disabled}
                        onPress={() => setTypePicker((value) => !value)}
                        className="min-h-12 flex-row items-center justify-between rounded-xl border border-line-control bg-surface-raised p-3"
                      >
                        <Text className="flex-1">
                          {t(
                            `dailyCheck.trailerTypes.${record.check.trailer_type ?? 'curtain'}`,
                          )}
                        </Text>
                        <DailyCheckIcon
                          name={typePicker ? 'chevron-up' : 'chevron-down'}
                          size={24}
                          className="text-ink-muted"
                        />
                      </TouchableOpacity>
                      {typePicker && (
                        <View className="rounded-xl border border-line bg-surface">
                          {TRAILER_TYPES.map((type) => (
                            <TouchableOpacity
                              key={type}
                              accessibilityRole="radio"
                              accessibilityLabel={t(
                                `dailyCheck.trailerTypes.${type}`,
                              )}
                              accessibilityState={{
                                checked: record.check.trailer_type === type,
                                disabled,
                              }}
                              disabled={disabled}
                              onPress={() => {
                                void model
                                  .setTrailerType(type)
                                  .then((saved) => {
                                    if (saved) {
                                      setTypePicker(false);
                                      setConfirmed(false);
                                    }
                                  });
                              }}
                              className="min-h-12 flex-row items-center gap-3 p-3"
                            >
                              <DailyCheckIcon
                                name={
                                  record.check.trailer_type === type
                                    ? 'radiobox-marked'
                                    : 'radiobox-blank'
                                }
                                size={24}
                                className="text-brand"
                              />
                              <Text>
                                {t(`dailyCheck.trailerTypes.${type}`)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                  <View className="flex-row flex-wrap items-center justify-between gap-2">
                    <Text variant="label">
                      {t(`dailyCheck.vehicles.${vehicle}`)}
                    </Text>
                    <Text variant="caption" accessibilityLiveRegion="polite">
                      {t('dailyCheck.progress', {
                        checked,
                        total: record.items.length,
                      })}
                    </Text>
                  </View>
                  <View className="overflow-hidden rounded-2xl border border-line bg-surface">
                    {record.items.map((item) => (
                      <DailyCheckItemRow
                        key={item.id}
                        item={item}
                        title={title(item)}
                        expanded={expanded === item.id}
                        disabled={disabled}
                        onToggleDetails={() =>
                          setExpanded(expanded === item.id ? null : item.id)
                        }
                        onChange={(patch) => {
                          setConfirmed(false);
                          model.editItem(item.id, patch);
                        }}
                        onPhoto={(remove) => {
                          setConfirmed(false);
                          void model.changePhoto(item.id, remove);
                        }}
                      />
                    ))}
                  </View>
                  <Text variant="caption">{t('dailyCheck.listHint')}</Text>
                </>
              ) : (
                <>
                  <Card className="gap-3">
                    <SummaryRow
                      label={t('dailyCheck.checkedPoints')}
                      value={`${checked} / ${record.items.length}`}
                    />
                    <SummaryRow
                      label={t('dailyCheck.issueCount')}
                      value={String(issues.length)}
                    />
                    {!!critical.length && (
                      <SummaryRow
                        label={t('dailyCheck.criticalCount')}
                        value={String(critical.length)}
                      />
                    )}
                    {completed && (
                      <SummaryRow
                        label={t('dailyCheck.confirmedBy')}
                        value={record.check.driver_name ?? ''}
                      />
                    )}
                  </Card>
                  {!!missing.length && !completed && (
                    <View className="gap-2 rounded-xl bg-info-surface p-3">
                      <Text tone="info" className="font-semibold">
                        {t('dailyCheck.missing', { count: missing.length })}
                      </Text>
                      {missing.map((item) => (
                        <Text key={item.id} tone="info">
                          {title(item)}
                        </Text>
                      ))}
                    </View>
                  )}
                  {!!critical.length && (
                    <View className="rounded-xl bg-danger-surface p-3">
                      <Text tone="danger">
                        {t(
                          completed
                            ? 'dailyCheck.criticalSaved'
                            : 'dailyCheck.criticalSummary',
                        )}
                      </Text>
                    </View>
                  )}
                  {!!observations.length && (
                    <Card className="gap-3">
                      <Text variant="label">
                        {t('dailyCheck.observations')}
                      </Text>
                      {observations.map((item) => (
                        <View
                          key={item.id}
                          className="gap-1 border-t border-line pt-3"
                        >
                          <Text className="font-semibold">{title(item)}</Text>
                          {!!item.has_issue && (
                            <Text variant="caption" tone="danger">
                              {t(
                                item.is_critical
                                  ? 'dailyCheck.criticalIssue'
                                  : 'dailyCheck.issue',
                              )}
                            </Text>
                          )}
                          {!!item.note?.trim() && <Text>{item.note}</Text>}
                          {!!item.photo_uri && (
                            <Text variant="caption">
                              {t('dailyCheck.photoAttached')}
                            </Text>
                          )}
                        </View>
                      ))}
                    </Card>
                  )}
                  {completed ? (
                    <View className="gap-4">
                      <Text variant="caption">
                        {t('dailyCheck.disclaimer')}
                      </Text>
                      <CheckAction
                        disabled={disabled}
                        onPress={() => {
                          void exportCheck(record);
                        }}
                      >
                        {t(
                          isExporting
                            ? 'dailyCheck.pdf.creating'
                            : 'dailyCheck.pdf.create',
                        )}
                      </CheckAction>
                      <CheckAction
                        disabled={disabled}
                        onPress={() => {
                          void model.startNew().then((saved) => {
                            if (saved) {
                              setExpanded(null);
                              move('list');
                            }
                          });
                        }}
                      >
                        {t('dailyCheck.startNew')}
                      </CheckAction>
                    </View>
                  ) : (
                    <Card className="gap-3">
                      <Text variant="label">
                        {t('dailyCheck.confirmationTitle')}
                      </Text>
                      <Text variant="caption">
                        {t('dailyCheck.driverName')}
                      </Text>
                      <TextInput
                        ref={nameInput}
                        accessibilityLabel={t('dailyCheck.driverName')}
                        value={name}
                        editable={!disabled}
                        maxLength={DRIVER_NAME_MAX_LENGTH}
                        onChangeText={(value) => {
                          setName(value);
                          setValidation(null);
                        }}
                        placeholder={t('dailyCheck.driverNamePlaceholder')}
                        placeholderTextColor={theme.colors.muted}
                        autoComplete="given-name"
                        className="min-h-12 rounded-xl border border-line-control bg-surface-raised p-3 text-base text-ink"
                      />
                      <CheckControl
                        label={t('dailyCheck.confirmation')}
                        checked={confirmed}
                        disabled={disabled}
                        onPress={() => {
                          setConfirmed((value) => !value);
                          setValidation(null);
                        }}
                      >
                        <Text>{t('dailyCheck.confirmation')}</Text>
                      </CheckControl>
                      <Text variant="caption">
                        {t('dailyCheck.confirmationHint')}
                      </Text>
                      {validation && (
                        <Text tone="danger" accessibilityRole="alert">
                          {t(`dailyCheck.${validation}`)}
                        </Text>
                      )}
                    </Card>
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
        {!!record && !loadError && !isLoading && (
          <View className="gap-2 border-t border-line bg-canvas px-4 py-3">
            {isSaving && (
              <Text variant="caption" accessibilityLiveRegion="polite">
                {t('dailyCheck.saving')}
              </Text>
            )}
            <CheckAction
              primary
              disabled={disabled || isSaving}
              onPress={() => {
                void primary();
              }}
            >
              {primaryLabel}
            </CheckAction>
          </View>
        )}
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row flex-wrap justify-between gap-2">
      <Text className="shrink">{label}</Text>
      <Text className="shrink font-semibold">{value}</Text>
    </View>
  );
}
