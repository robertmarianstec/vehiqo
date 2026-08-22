import type { WorkMode } from '@/db/types';

// Single source of truth for mode→color class names. NativeWind needs literal
// class strings to statically detect them at build time, so these must stay
// spelled out here (not built dynamically from the mode key elsewhere).
// `tint` is the mode color at low opacity, for surfaces that carry text. The
// five hues differ too much in lightness for any one text color to sit on them
// at full strength — light text drops to 2.1:1 on standby's lime, dark text to
// 3.3:1 on rest's violet — so the fill stays faint and the text stays neutral.
export const MODE_COLORS: Record<
  WorkMode,
  { bg: string; tint: string; border: string; text: string }
> = {
  driving: {
    bg: 'bg-driving',
    tint: 'bg-driving/25',
    border: 'border-driving',
    text: 'text-driving',
  },
  other_work: {
    bg: 'bg-other-work',
    tint: 'bg-other-work/25',
    border: 'border-other-work',
    text: 'text-other-work',
  },
  standby: {
    bg: 'bg-standby',
    tint: 'bg-standby/25',
    border: 'border-standby',
    text: 'text-standby',
  },
  break: {
    bg: 'bg-break',
    tint: 'bg-break/25',
    border: 'border-break',
    text: 'text-break',
  },
  rest: {
    bg: 'bg-rest',
    tint: 'bg-rest/25',
    border: 'border-rest',
    text: 'text-rest',
  },
};
