/// <reference types="node" />

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { act, render, screen } from '@testing-library/react-native';
import {
  Appearance,
  processColor,
  StyleSheet,
  Text as NativeText,
  type TextProps,
  type TouchableOpacityProps,
  View,
  type ViewProps,
} from 'react-native';
import { compile } from 'react-native-css/compiler';
import { colorScheme, StyleCollection } from 'react-native-css/native';

import { AlertBanner } from '@/components/AlertBanner';
import { Card } from '@/components/Card';
import { CheckAction } from '@/components/DailyCheckControls';
import { ModeButton } from '@/components/ModeButton';
import { ProgressBar } from '@/components/ProgressBar';
import { Text } from '@/components/Text';
import { MODE_COLORS } from '@/constants/modeColors';
import { useAppTheme } from '@/hooks/useAppTheme';
import i18n from '@/i18n';

// Exercise the same CSS component replacement as Metro, without faking colors.
jest.mock('react-native', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  const api = () =>
    jest.requireActual<typeof import('react-native-css/native')>(
      'react-native-css/native',
    );
  const NativeText = (props: Record<string, unknown>) => (
    <native.Text {...props} />
  );
  const NativeView = (props: Record<string, unknown>) => (
    <native.View {...props} />
  );
  const NativeButton = (props: Record<string, unknown>) => (
    <native.TouchableOpacity {...props} />
  );
  const components = {
    // The React Native Jest preset otherwise returns a fixed light scheme.
    useColorScheme: () => native.Appearance.getColorScheme(),
    Text: (props: TextProps) =>
      api().useCssElement(NativeText, props, { className: 'style' } as const),
    View: (props: ViewProps) =>
      api().useCssElement(NativeView, props, { className: 'style' } as const),
    TouchableOpacity: (props: TouchableOpacityProps) =>
      api().useCssElement(NativeButton, props, { className: 'style' } as const),
  };
  return new Proxy(native, {
    get(target, property, receiver) {
      return property in components
        ? components[property as keyof typeof components]
        : Reflect.get(target, property, receiver);
    },
  });
});

let css: string;

function contrast(foreground: unknown, background: unknown): number {
  function luminance(value: unknown): number {
    if (typeof value !== 'string') throw new Error('Expected a resolved color');
    const color = processColor(value);
    if (typeof color !== 'number')
      throw new Error(`Unresolved color: ${value}`);
    const channels = [16, 8, 0].map((shift) => {
      const channel = ((color >>> shift) & 255) / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

beforeAll(() => {
  // Tailwind's Node loader hooks cannot be installed inside Jest's runtime.
  css = execFileSync(
    process.execPath,
    [
      '-e',
      [
        "const fs = require('node:fs');",
        "const postcss = require('postcss');",
        "const tailwind = require('@tailwindcss/postcss');",
        "postcss([tailwind()]).process(fs.readFileSync('global.css', 'utf8'),",
        "{ from: 'global.css' }).then(result => process.stdout.write(result.css))",
        '.catch(error => { console.error(error); process.exitCode = 1; });',
      ].join('\n'),
    ],
    { cwd: resolve(__dirname, '../../..'), encoding: 'utf8', timeout: 15_000 },
  );
}, 20_000);

beforeEach(() => {
  StyleCollection.styles.clear();
  colorScheme.set('light');
  StyleCollection.inject(compile(css, { hexColors: true }).stylesheet());
});

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

afterEach(() => jest.restoreAllMocks());

describe('theme colors', () => {
  it.each([
    { scheme: 'light', primary: '#192838', muted: '#49596b' },
    { scheme: 'dark', primary: '#f3f5f9', muted: '#9da6b4' },
  ] as const)(
    'keeps primary and secondary text distinct in the $scheme theme',
    async ({ scheme, primary, muted }) => {
      colorScheme.set(scheme);
      await render(
        <Card>
          <Text>Primary</Text>
          <Text variant="caption">Secondary</Text>
        </Card>,
      );
      const main = StyleSheet.flatten(screen.getByText('Primary').props.style);
      const secondary = StyleSheet.flatten(
        screen.getByText('Secondary').props.style,
      );
      expect(processColor(main.color)).toBe(processColor(primary));
      expect(processColor(secondary.color)).toBe(processColor(muted));
      const card = screen.toJSON();
      expect(
        processColor(StyleSheet.flatten(card?.props.style).backgroundColor),
      ).toBe(processColor(scheme === 'light' ? '#dce4ec' : '#14171d'));
    },
  );

  it('updates an already mounted label when the theme changes and changes back', async () => {
    colorScheme.set('light');
    await render(<Text>Current theme</Text>);
    const currentColor = () =>
      processColor(
        StyleSheet.flatten(screen.getByText('Current theme').props.style).color,
      );
    expect(currentColor()).toBe(processColor('#192838'));
    await act(() => colorScheme.set('dark'));
    expect(currentColor()).toBe(processColor('#f3f5f9'));
    await act(() => colorScheme.set('light'));
    expect(currentColor()).toBe(processColor('#192838'));
  });
});

describe.each(['light', 'dark'] as const)('%s theme components', (scheme) => {
  beforeEach(() => {
    colorScheme.set(scheme);
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(scheme);
  });

  it('keeps the daily check primary action readable', async () => {
    await render(
      <CheckAction primary onPress={() => {}}>
        Save check
      </CheckAction>,
    );
    const text = StyleSheet.flatten(screen.getByText('Save check').props.style);
    const button = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(contrast(text.color, button.backgroundColor)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it.each(['info', 'warning', 'danger'] as const)(
    'keeps the %s alert message readable against its own surface',
    async (severity) => {
      await render(
        <AlertBanner
          alert={{
            id: 'weeklyDriving',
            severity,
            messageKey: `workTimer.warnings.weeklyDriving.${severity}`,
            percent: 90,
          }}
        />,
      );
      const text = StyleSheet.flatten(screen.getByText(/weekly/i).props.style);
      const surface = StyleSheet.flatten(screen.getByRole('alert').props.style);
      expect(
        contrast(text.color, surface.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
      expect(processColor(text.color)).not.toBe(
        processColor(scheme === 'light' ? '#192838' : '#f3f5f9'),
      );
    },
  );

  describe.each(['driving', 'other_work', 'standby', 'break', 'rest'] as const)(
    '%s button',
    (mode) => {
      it('keeps the mode label readable on the main counter', async () => {
        await render(
          <View testID="counter" className="bg-surface-raised">
            <NativeText className={MODE_COLORS[mode].text}>
              Current mode
            </NativeText>
          </View>,
        );
        const label = StyleSheet.flatten(
          screen.getByText('Current mode').props.style,
        );
        const counter = StyleSheet.flatten(
          screen.getByTestId('counter').props.style,
        );
        expect(
          contrast(label.color, counter.backgroundColor),
        ).toBeGreaterThanOrEqual(4.5);
      });

      it.each([true, false])(
        'keeps its label readable when selected=%s',
        async (selected) => {
          await render(
            <ModeButton
              mode={mode}
              label="Mode"
              selected={selected}
              onPress={jest.fn()}
            />,
          );
          const label = StyleSheet.flatten(
            screen.getByText('Mode').props.style,
          );
          const button = StyleSheet.flatten(
            screen.getByRole('button').props.style,
          );
          expect(
            contrast(label.color, button.backgroundColor),
          ).toBeGreaterThanOrEqual(4.5);
          expect(button.borderColor).toBeDefined();
        },
      );
    },
  );

  it.each([
    { value: 40, light: '#1e824c', dark: '#1e824c' },
    { value: 90, light: '#956000', dark: '#e3c23b' },
    { value: 100, light: '#b42c3e', dark: '#e64343' },
  ])(
    'resolves the progress color at $value percent',
    async ({ value, light, dark }) => {
      await render(<ProgressBar value={value} limit={100} />);
      const tree = screen.toJSON();
      const fill = tree?.children[0];
      if (!fill || typeof fill === 'string')
        throw new Error('Missing progress fill');
      expect(
        processColor(StyleSheet.flatten(fill.props.style).backgroundColor),
      ).toBe(processColor(scheme === 'light' ? light : dark));
    },
  );

  it('uses the CSS palette for navigation as well as screen content', async () => {
    function NavigationColors() {
      const theme = useAppTheme();
      return (
        <Text
          testID="navigation"
          style={{
            color: theme.colors.primary,
            backgroundColor: theme.colors.card,
          }}
        >
          {theme.dark ? 'dark' : 'light'}
        </Text>
      );
    }
    await render(<NavigationColors />);
    const style = StyleSheet.flatten(
      screen.getByTestId('navigation').props.style,
    );
    expect(processColor(style.color)).toBe(
      processColor(scheme === 'light' ? '#00628f' : '#24abe8'),
    );
    expect(processColor(style.backgroundColor)).toBe(
      processColor(scheme === 'light' ? '#e1e8ee' : '#14171d'),
    );
    expect(screen.getByText(scheme)).toBeOnTheScreen();
  });
});
