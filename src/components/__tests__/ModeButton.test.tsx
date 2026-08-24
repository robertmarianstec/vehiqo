import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ModeButton } from '@/components/ModeButton';
import type { WorkMode } from '@/db/types';

// NativeWind resolves className at build time, so under Jest the class strings
// never reach the host element of a TouchableOpacity. What the driver relies on
// here — the label, the press, the selected state, the icon — is asserted
// through the props that do survive.

const MODES: WorkMode[] = ['driving', 'other_work', 'standby', 'break', 'rest'];

const glyphMap: Record<string, string | number> =
  MaterialCommunityIcons.glyphMap;

function renderedIconGlyph(): string {
  const button = screen.toJSON();
  const icon = button?.children.find(
    (child) =>
      typeof child !== 'string' &&
      child.props.style?.some?.(
        (entry: { fontFamily?: string } | null) =>
          entry?.fontFamily === 'material-community',
      ),
  );
  if (
    !icon ||
    typeof icon === 'string' ||
    typeof icon.children[0] !== 'string'
  ) {
    throw new Error('ModeButton rendered no icon');
  }
  return icon.children[0];
}

function iconNamesFor(glyph: string): string[] {
  const codePoint = glyph.codePointAt(0);
  return Object.keys(glyphMap).filter((name) => {
    const value = glyphMap[name];
    return typeof value === 'number' ? value === codePoint : value === glyph;
  });
}

describe('ModeButton', () => {
  it('reports its selected state to assistive technology', async () => {
    await render(
      <ModeButton
        mode="driving"
        label="DRIVING"
        selected
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('leaves the idle button unselected', async () => {
    await render(
      <ModeButton
        mode="driving"
        label="DRIVING"
        selected={false}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('switches mode on a single press', async () => {
    const onPress = jest.fn();
    await render(
      <ModeButton
        mode="break"
        label="BREAK"
        selected={false}
        onPress={onPress}
      />,
    );
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows the label it is given, not the raw mode key', async () => {
    await render(
      <ModeButton
        mode="other_work"
        label="INNA PRACA"
        selected={false}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('INNA PRACA')).toBeOnTheScreen();
  });

  it('gives every mode its own icon', async () => {
    const glyphs: string[] = [];
    for (const mode of MODES) {
      const view = await render(
        <ModeButton mode={mode} label={mode} selected onPress={jest.fn()} />,
      );
      glyphs.push(renderedIconGlyph());
      await view.unmount();
    }
    expect(new Set(glyphs).size).toBe(MODES.length);
  });

  it.each(MODES)('draws the %s icon in the outline style', async (mode) => {
    await render(
      <ModeButton mode={mode} label={mode} selected onPress={jest.fn()} />,
    );
    const names = iconNamesFor(renderedIconGlyph());
    expect(names.some((name) => name.endsWith('-outline'))).toBe(true);
  });
});
