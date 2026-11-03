import type { DailyCheckItemKey, TrailerType, VehicleType } from '@/db/types';

export const TRAILER_TYPES: TrailerType[] = [
  'curtain',
  'fridge',
  'tanker',
  'tipper',
  'platform',
];
export const DAILY_CHECK_NOTE_MAX_LENGTH = 2000;
export const DRIVER_NAME_MAX_LENGTH = 80;

export function getDailyCheckItemKeys(
  vehicle: VehicleType,
): DailyCheckItemKey[] {
  return vehicle === 'tractor'
    ? [
        'tyres',
        'lights',
        'mirrors',
        'brakes',
        'fluids',
        'coupling',
        'documents',
      ]
    : ['tyres', 'lights', 'brakes', 'coupling', 'load', 'body'];
}
