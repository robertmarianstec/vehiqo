import { getDailyCheckItemKeys } from '@/constants/dailyCheck';
import type { DailyCheckRecord, VehicleType } from '@/db/types';

export const CHECK_STARTED_AT = new Date(2026, 10, 3, 7, 20).getTime();
export const CHECK_CONFIRMED_AT = CHECK_STARTED_AT + 15 * 60_000;

export function dailyCheckFixture(
  vehicle: VehicleType = 'tractor',
): DailyCheckRecord {
  return {
    check: {
      id: 'inspection-example',
      vehicle_type: vehicle,
      trailer_type: vehicle === 'trailer' ? 'fridge' : null,
      started_at: CHECK_STARTED_AT,
      completed_at: CHECK_CONFIRMED_AT,
      driver_name: 'Anna Testowa',
      signature_uri: null,
      gps_lat: null,
      gps_lng: null,
      notes: null,
      created_at: CHECK_STARTED_AT,
      updated_at: CHECK_CONFIRMED_AT,
      synced_at: null,
    },
    items: getDailyCheckItemKeys(vehicle).map((key, index) => ({
      id: `item-${index}`,
      daily_check_id: 'inspection-example',
      item_key: key,
      checked: 1,
      has_issue: 0,
      is_critical: 0,
      note: null,
      photo_uri: null,
      created_at: CHECK_STARTED_AT,
      updated_at: CHECK_CONFIRMED_AT,
    })),
  };
}
