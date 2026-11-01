import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { DayTimelineBar } from '@/components/DayTimelineBar';
import i18n from '@/i18n';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe.each([false, true])('DayTimelineBar (compact=%s)', (compact) => {
  it.each([
    { name: 'ordinary', month: 5, day: 15, hours: 24, morningHours: 6 },
    { name: 'spring forward', month: 2, day: 29, hours: 23, morningHours: 5 },
    { name: 'autumn back', month: 9, day: 25, hours: 25, morningHours: 7 },
  ])(
    'aligns clock labels with elapsed time on the $name day',
    async ({ month, day, hours, morningHours }) => {
      await render(
        <DayTimelineBar
          compact={compact}
          segments={[]}
          bounds={{
            dayStart: new Date(2026, month, day).getTime(),
            dayEnd: new Date(2026, month, day + 1).getTime(),
          }}
        />,
      );

      for (const [index, label] of ['06', '12', '18'].entries()) {
        const style = StyleSheet.flatten(screen.getByText(label).props.style);
        expect(style).toMatchObject({ position: 'absolute', top: 0 });
        const expectedPercent = ((morningHours + index * 6) / hours) * 100;
        expect(parseFloat(style.left)).toBeCloseTo(expectedPercent, 6);
        expect(style.transform).toEqual([{ translateX: '-50%' }]);
      }

      expect(screen.getByText('00')).toBeOnTheScreen();
      expect(screen.getByText('24')).toBeOnTheScreen();
    },
  );
});
