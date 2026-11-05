import { useState } from 'react';

import { formatLocalSleepTime } from '@/utils/fatigue';
import { readTimeParts } from '@/utils/timeInput';

import type { TimeDialProps } from './TimeDial.types';

export function TimeDial({ label, value, onChange }: TimeDialProps) {
  const [draft, setDraft] = useState(
    () => formatLocalSleepTime(value.getTime()).time,
  );
  return (
    <input
      type="time"
      aria-label={label}
      value={draft}
      step={60}
      onChange={(event) => {
        setDraft(event.currentTarget.value);
        const [hours, minutes] = event.currentTarget.value.split(':');
        const parsed = readTimeParts(hours ?? '', minutes ?? '');
        onChange(
          parsed ? new Date(2000, 0, 15, parsed.hour, parsed.minute) : null,
        );
      }}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        minHeight: 64,
        fontSize: 24,
        padding: 12,
        background: 'var(--surface-control)',
        color: 'var(--ink)',
        border: '1px solid var(--line-control)',
        borderRadius: 12,
        colorScheme: 'light dark',
      }}
    />
  );
}
