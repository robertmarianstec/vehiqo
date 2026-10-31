import type { WorkMode } from '@/db/types';

// NativeWind needs literal class names to discover every mode at build time.
export const MODE_COLORS: Record<
  WorkMode,
  { bg: string; tint: string; border: string; text: string; dot: string }
> = {
  driving: {
    bg: 'bg-driving',
    tint: 'bg-driving-tint',
    border: 'border-driving-edge',
    text: 'text-driving-ink',
    dot: 'bg-driving-edge',
  },
  other_work: {
    bg: 'bg-other-work',
    tint: 'bg-other-work-tint',
    border: 'border-other-work-edge',
    text: 'text-other-work-ink',
    dot: 'bg-other-work-edge',
  },
  standby: {
    bg: 'bg-standby',
    tint: 'bg-standby-tint',
    border: 'border-standby-edge',
    text: 'text-standby-ink',
    dot: 'bg-standby-edge',
  },
  break: {
    bg: 'bg-break',
    tint: 'bg-break-tint',
    border: 'border-break-edge',
    text: 'text-break-ink',
    dot: 'bg-break-edge',
  },
  rest: {
    bg: 'bg-rest',
    tint: 'bg-rest-tint',
    border: 'border-rest-edge',
    text: 'text-rest-ink',
    dot: 'bg-rest-edge',
  },
};
