import {
  DAILY_CHECK_NOTE_MAX_LENGTH,
  DRIVER_NAME_MAX_LENGTH,
  getDailyCheckItemKeys,
  TRAILER_TYPES,
} from '@/constants/dailyCheck';
import { generateId } from '@/utils/id';

import { getDatabase } from './index';
import { queueOperation } from './queue';
import type {
  DailyCheck,
  DailyCheckItem,
  DailyCheckItemPatch,
  DailyCheckRecord,
  TrailerType,
  VehicleType,
} from './types';

type Database = Awaited<ReturnType<typeof getDatabase>>;
const DRIVER_KEY = 'daily_check_driver_name';

function timestamp(value: number) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Number.isFinite(new Date(value).getTime())
  )
    throw new RangeError('Invalid daily check timestamp');
}

function validate(record: DailyCheckRecord): DailyCheckRecord {
  const { check, items } = record;
  if (!['tractor', 'trailer'].includes(check.vehicle_type))
    throw new Error('Invalid vehicle type');
  if (
    check.vehicle_type === 'trailer' &&
    !TRAILER_TYPES.includes(check.trailer_type!)
  )
    throw new Error('Invalid trailer type');
  const keys = getDailyCheckItemKeys(check.vehicle_type);
  if (
    items.length !== keys.length ||
    keys.some(
      (key) => items.filter((item) => item.item_key === key).length !== 1,
    )
  )
    throw new Error('Invalid checklist items');
  timestamp(check.started_at);
  timestamp(check.updated_at);
  if (check.completed_at !== null) timestamp(check.completed_at);
  if (
    check.updated_at < check.started_at ||
    (check.completed_at !== null && check.completed_at < check.started_at)
  )
    throw new Error('Invalid daily check interval');
  if (
    check.updated_at > Date.now() ||
    check.started_at > Date.now() ||
    (check.completed_at !== null && check.completed_at > Date.now())
  )
    throw new RangeError('Daily check time precedes recorded history');
  for (const item of items) {
    if (
      ![0, 1].includes(item.checked) ||
      ![0, 1].includes(item.has_issue) ||
      ![0, 1].includes(item.is_critical) ||
      (item.is_critical && !item.has_issue)
    )
      throw new Error('Invalid checklist flags');
    if (item.photo_uri !== null && !validPhotoUri(item.photo_uri))
      throw new Error('Invalid checklist photo');
  }
  return {
    check,
    items: keys.map((key) => items.find((item) => item.item_key === key)!),
  };
}

function validPhotoUri(uri: string): boolean {
  return (
    typeof uri === 'string' &&
    uri.startsWith('file://') &&
    /\/daily-check-photos\/[a-z\d-]+\.(jpe?g|png|webp|heic|heif|gif)$/i.test(
      uri,
    ) &&
    !uri.includes('/../')
  );
}

async function read(db: Database, id: string): Promise<DailyCheckRecord> {
  const check = await db.getFirstAsync<DailyCheck>(
    'SELECT * FROM daily_checks WHERE id = ?;',
    id,
  );
  if (!check) throw new Error('Daily check not found');
  const items = await db.getAllAsync<DailyCheckItem>(
    'SELECT * FROM daily_check_items WHERE daily_check_id = ?;',
    id,
  );
  return validate({ check, items });
}

function editable(record: DailyCheckRecord, now: number) {
  timestamp(now);
  if (record.check.completed_at !== null)
    throw new Error('Daily check already completed');
  if (now < record.check.started_at || now < record.check.updated_at)
    throw new RangeError('Daily check time precedes recorded changes');
}

export function getDailyCheckDriverName(): Promise<string> {
  return queueOperation(async () => {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?;',
      DRIVER_KEY,
    );
    return row?.value ?? '';
  });
}

export function getOrCreateDailyCheck(
  vehicle: VehicleType,
  forceNew = false,
): Promise<DailyCheckRecord> {
  return queueOperation(async () => {
    if (!['tractor', 'trailer'].includes(vehicle))
      throw new Error('Invalid vehicle type');
    const db = await getDatabase();
    let result!: DailyCheckRecord;
    await db.withTransactionAsync(async () => {
      const draft = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM daily_checks WHERE vehicle_type = ? AND completed_at IS NULL ORDER BY started_at DESC, id DESC LIMIT 1;',
        vehicle,
      );
      if (draft) {
        result = await read(db, draft.id);
        return;
      }
      const now = Date.now();
      timestamp(now);
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      const latest = !forceNew
        ? await db.getFirstAsync<{ id: string }>(
            'SELECT id FROM daily_checks WHERE vehicle_type = ? AND completed_at >= ? ORDER BY completed_at DESC, id DESC LIMIT 1;',
            vehicle,
            day.getTime(),
          )
        : null;
      if (latest) {
        result = await read(db, latest.id);
        return;
      }
      const id = generateId();
      await db.runAsync(
        'INSERT INTO daily_checks (id, vehicle_type, trailer_type, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);',
        id,
        vehicle,
        vehicle === 'trailer' ? 'curtain' : null,
        now,
        now,
        now,
      );
      for (const key of getDailyCheckItemKeys(vehicle))
        await db.runAsync(
          'INSERT INTO daily_check_items (id, daily_check_id, item_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?);',
          generateId(),
          id,
          key,
          now,
          now,
        );
      result = await read(db, id);
    });
    return result;
  });
}

export function updateDailyCheckItem(
  checkId: string,
  itemId: string,
  patch: DailyCheckItemPatch,
): Promise<DailyCheckRecord> {
  const changes = { ...patch };
  return queueOperation(async () => {
    const db = await getDatabase();
    let result!: DailyCheckRecord;
    await db.withTransactionAsync(async () => {
      const record = await read(db, checkId),
        now = Date.now();
      editable(record, now);
      const item = record.items.find((value) => value.id === itemId);
      if (!item) throw new Error('Checklist item not found');
      const next = { ...item, ...changes };
      if (changes.has_issue === 0) next.is_critical = 0;
      if (
        ![0, 1].includes(next.checked) ||
        ![0, 1].includes(next.has_issue) ||
        ![0, 1].includes(next.is_critical) ||
        (next.is_critical && !next.has_issue)
      )
        throw new Error('Invalid checklist flags');
      if (
        next.note !== null &&
        (typeof next.note !== 'string' ||
          next.note.length > DAILY_CHECK_NOTE_MAX_LENGTH)
      )
        throw new Error('Invalid checklist note');
      if (next.photo_uri !== null && !validPhotoUri(next.photo_uri))
        throw new Error('Invalid checklist photo');
      await db.runAsync(
        'UPDATE daily_check_items SET checked = ?, has_issue = ?, is_critical = ?, note = ?, photo_uri = ?, updated_at = ? WHERE id = ? AND daily_check_id = ?;',
        next.checked,
        next.has_issue,
        next.is_critical,
        next.note,
        next.photo_uri,
        now,
        itemId,
        checkId,
      );
      await db.runAsync(
        'UPDATE daily_checks SET updated_at = ? WHERE id = ?;',
        now,
        checkId,
      );
      result = await read(db, checkId);
    });
    return result;
  });
}

export function changeDailyCheckTrailerType(
  checkId: string,
  trailerType: TrailerType,
): Promise<DailyCheckRecord> {
  return queueOperation(async () => {
    if (!TRAILER_TYPES.includes(trailerType))
      throw new Error('Invalid trailer type');
    const db = await getDatabase();
    let result!: DailyCheckRecord;
    await db.withTransactionAsync(async () => {
      const record = await read(db, checkId),
        now = Date.now();
      editable(record, now);
      if (record.check.vehicle_type !== 'trailer')
        throw new Error('Not a trailer check');
      if (record.check.trailer_type !== trailerType) {
        await db.runAsync(
          'UPDATE daily_checks SET trailer_type = ?, updated_at = ? WHERE id = ?;',
          trailerType,
          now,
          checkId,
        );
        await db.runAsync(
          "UPDATE daily_check_items SET checked = 0, updated_at = ? WHERE daily_check_id = ? AND item_key = 'body';",
          now,
          checkId,
        );
      }
      result = await read(db, checkId);
    });
    return result;
  });
}

export function completeDailyCheck(
  checkId: string,
  driverName: string,
  confirmed: boolean,
): Promise<DailyCheckRecord> {
  return queueOperation(async () => {
    const name = driverName.trim();
    if (!confirmed || !name || name.length > DRIVER_NAME_MAX_LENGTH)
      throw new Error('Missing daily check confirmation');
    const db = await getDatabase();
    let result!: DailyCheckRecord;
    await db.withTransactionAsync(async () => {
      const record = await read(db, checkId),
        now = Date.now();
      if (record.check.completed_at !== null) {
        result = record;
        return;
      }
      editable(record, now);
      if (record.items.some((item) => item.checked !== 1))
        throw new Error('Incomplete daily check');
      await db.runAsync(
        'UPDATE daily_checks SET completed_at = ?, driver_name = ?, updated_at = ? WHERE id = ?;',
        now,
        name,
        now,
        checkId,
      );
      await db.runAsync(
        'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?);',
        DRIVER_KEY,
        name,
        now,
      );
      result = await read(db, checkId);
    });
    return result;
  });
}
