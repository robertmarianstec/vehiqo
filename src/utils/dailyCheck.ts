import type { TFunction } from 'i18next';

import type { DailyCheck, DailyCheckItem } from '@/db/types';

export function getDailyCheckItemTitle(
  t: TFunction,
  check: DailyCheck,
  item: DailyCheckItem,
): string {
  if (check.vehicle_type === 'trailer') {
    if (item.item_key === 'body' && check.trailer_type)
      return t(`dailyCheck.trailerItems.body.${check.trailer_type}`);
    if (
      item.item_key === 'lights' ||
      item.item_key === 'brakes' ||
      item.item_key === 'coupling'
    )
      return t(`dailyCheck.trailerItems.${item.item_key}`);
  }
  return t(`dailyCheck.items.${item.item_key}`);
}
