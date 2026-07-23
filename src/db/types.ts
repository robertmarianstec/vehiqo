export type WorkMode = 'driving' | 'other_work' | 'standby' | 'break' | 'rest';

export interface WorkSession {
  id: string;
  mode: WorkMode;
  started_at: number;
  ended_at: number | null;
  created_at: number;
  updated_at: number;
  synced_at: number | null;
}

export type VehicleType = 'tractor' | 'trailer';

export interface DailyCheck {
  id: string;
  vehicle_type: VehicleType;
  started_at: number;
  completed_at: number | null;
  signature_uri: string | null;
  notes: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  created_at: number;
  updated_at: number;
  synced_at: number | null;
}

export interface DailyCheckItem {
  id: string;
  daily_check_id: string;
  item_key: string;
  checked: 0 | 1;
  photo_uri: string | null;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export interface FatigueSession {
  id: string;
  woke_at: number;
  slept_at: number | null;
  duration_seconds: number | null;
  created_at: number;
  updated_at: number;
  synced_at: number | null;
}

export interface AppSetting {
  key: string;
  value: string;
  updated_at: number;
}

export type ThemePreference = 'system' | 'light' | 'dark';
