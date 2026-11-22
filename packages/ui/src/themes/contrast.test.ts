import { describe, expect, it } from 'vitest';

import {
  DEFAULT_THEME_ID,
  getTheme,
  isThemeId,
  KIND_COLORS,
  themeFamilies,
  type ColorMode,
  type ThemeColors,
} from './index';

// WCAG 2.2 relative luminance and contrast ratio for opaque #RRGGBB colours.
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Not an opaque #RRGGBB colour: ${hex}`);
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => channel(parseInt(part ?? '', 16)));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

type Role = Exclude<keyof ThemeColors, 'tones' | 'kinds'>;

// DESIGN.md §3: every text pair meets WCAG AA for body text (4.5:1). The accent is also used for
// links, so it is held to the text ratio on both page and card backgrounds.
const TEXT_PAIRS: [fg: Role, bg: Role][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['textMuted', 'bg'],
  ['textMuted', 'surface'],
  ['onAccent', 'accent'],
  ['warnText', 'warnBg'],
  ['onSuccess', 'success'],
  ['fabText', 'fabBg'],
  ['accent', 'bg'],
  ['accent', 'surface'],
  // The dragged entry floats on the raised surface (spec 0016).
  ['text', 'surfaceRaised'],
  ['textMuted', 'surfaceRaised'],
  ['accent', 'surfaceRaised'],
];
// Non-text UI (WCAG 1.4.11): the check mark fill and the assistant button must stand out from
// the card and the page by at least 3:1.
const GRAPHIC_PAIRS: [fg: Role, bg: Role][] = [
  ['success', 'surface'],
  ['fabBg', 'bg'],
];

const MODES: ColorMode[] = ['light', 'dark'];
const cases = themeFamilies.flatMap((family) =>
  MODES.map((mode) => ({ name: `${family.id} ${mode}`, colors: getTheme(family.id, mode).colors })),
);

describe('theme contrast (DESIGN.md §3)', () => {
  it('computes the WCAG ratio of black on white as 21:1', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  describe.each(cases)('$name', ({ colors }) => {
    it.each(TEXT_PAIRS)('%s on %s reaches 4.5:1', (fg, bg) => {
      expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(GRAPHIC_PAIRS)('%s against %s reaches 3:1', (fg, bg) => {
      expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(3);
    });

    it.each(Object.entries(colors.tones))('tone %s: fg on bg reaches 4.5:1', (_tone, tone) => {
      expect(contrast(tone.fg, tone.bg)).toBeGreaterThanOrEqual(4.5);
    });
  });
});

// Spec 0005, D4: "Frisch" shows one area colour per screen. Its strong shade (`fg`) draws the line
// under the active view tab and, in dark mode, fills the primary action, so it must stand out from
// the page and from cards. Text on the area fill is covered by "fg on bg" above.
const AREA_TONE_CASES = cases.filter(({ name }) => name.startsWith('frisch'));

describe('Frisch area colours (spec 0005, AC-051)', () => {
  describe.each(AREA_TONE_CASES)('$name', ({ colors }) => {
    it.each(Object.entries(colors.tones))('tone %s: fg against bg reaches 3:1', (_tone, tone) => {
      expect(contrast(tone.fg, colors.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(tone.fg, colors.surface)).toBeGreaterThanOrEqual(3);
    });

    it('rating stars stand out from cards by 3:1', () => {
      expect(contrast(colors.star, colors.surface)).toBeGreaterThanOrEqual(3);
    });
  });

  it('is the only theme that paints area colours', () => {
    const painting = themeFamilies.filter((family) => family.light.shape.areaTone);
    expect(painting.map((family) => family.id)).toEqual(['frisch']);
  });
});

// Spec 0010, D19: the kind of a calendar entry shows as a 3 px edge or a dot in its colour. As a
// graphic it must stand out from the page and from cards by 3:1 in every theme and mode, and no
// theme may leave a kind out.
describe('kind colours (spec 0010, AC-010)', () => {
  const pairs = cases.flatMap(({ name, colors }) =>
    KIND_COLORS.map((kind) => ({ name, kind, colors })),
  );
  it.each(pairs)('$name: role $kind exists and reaches 3:1 on page and card', (pair) => {
    const kinds = (pair.colors as Partial<ThemeColors>).kinds as
      Partial<Record<string, string>> | undefined;
    const value = kinds?.[pair.kind];
    expect(value, `${pair.name} has no colour for the kind "${pair.kind}"`).toBeDefined();
    expect(contrast(value ?? '#000000', pair.colors.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(value ?? '#000000', pair.colors.surface)).toBeGreaterThanOrEqual(3);
  });
});

describe('theme selection', () => {
  it('AC-047: an unknown stored theme id falls back to Markthalle', () => {
    expect(getTheme('gibt-es-nicht', 'light').id).toBe('markthalle');
    expect(getTheme(null, 'dark')).toBe(getTheme('markthalle', 'dark'));
    expect(getTheme(undefined, 'light').mode).toBe('light');
    expect(DEFAULT_THEME_ID).toBe('markthalle');
  });

  it('returns the requested theme and mode for a known id', () => {
    const theme = getTheme('frisch', 'dark');
    expect(theme.id).toBe('frisch');
    expect(theme.mode).toBe('dark');
  });

  it('accepts only the three theme ids as stored value', () => {
    expect(isThemeId('markthalle')).toBe(true);
    expect(isThemeId('klar')).toBe(true);
    expect(isThemeId('frisch')).toBe(true);
    expect(isThemeId('Markthalle')).toBe(false);
    expect(isThemeId(42)).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
  });
});
