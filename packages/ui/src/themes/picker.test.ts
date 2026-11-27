import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getTheme, pickerFamilies, themeFamilies } from './index';

const ids = (families: { id: string }[]) => families.map((family) => family.id);

// Spec 0058: the nine themes, the "Wolke" palette from the proposal and the short picker.
describe('new themes (spec 0058)', () => {
  it('AC-001: "Wolke" has the colours of the proposal in both modes', () => {
    const light = getTheme('wolke', 'light').colors;
    expect([light.bg, light.surface, light.accent, light.success]).toEqual([
      '#F2D3DB',
      '#FCEEF1',
      '#5B3B41',
      '#9B4D63',
    ]);
    const dark = getTheme('wolke', 'dark').colors;
    expect([dark.bg, dark.accent]).toEqual(['#241A1D', '#F4B6C4']);
  });

  it('AC-004: nine themes in a fixed order, the three old ones first, each described', () => {
    expect(ids(themeFamilies)).toEqual([
      'markthalle',
      'klar',
      'frisch',
      'wolke',
      'mitternacht',
      'zitrus',
      'salbei',
      'lavendel',
      'espresso',
    ]);
    for (const family of themeFamilies) {
      expect(family.description.length, family.id).toBeGreaterThan(10);
      expect(family.light.id).toBe(family.id);
      expect(family.dark.mode).toBe('dark');
    }
  });

  it('AC-005, AC-006: only "Wolke" paints a sky behind the page', () => {
    const painting = themeFamilies.filter((family) => family.light.backdrop !== undefined);
    expect(ids(painting)).toEqual(['wolke']);
    expect(getTheme('wolke', 'light').backdrop).toMatch(/gradient/);
    expect(getTheme('wolke', 'dark').backdrop).toMatch(/gradient/);
    expect(getTheme('markthalle', 'light').backdrop).toBeUndefined();
  });

  it('AC-008 – AC-010: only "Wolke" shows bubbles', () => {
    const bubbly = themeFamilies.filter((family) => family.light.shape.bubble !== undefined);
    expect(ids(bubbly)).toEqual(['wolke']);
    expect(getTheme('wolke', 'light').shape.tabActive).toBe('bubble');
    expect(getTheme('markthalle', 'light').shape.tabActive).toBe('tint');
  });
});

describe('theme fonts (spec 0058, REQ-006)', () => {
  // fonts.ts requires the files, which only the bundler resolves; its source names the keys.
  const bundled = readFileSync(fileURLToPath(new URL('../fonts.ts', import.meta.url)), 'utf8');

  it.each(themeFamilies.map((family) => [family.id, family.light] as const))(
    '%s: every font of a text style is in its list and bundled with the app',
    (_id, theme) => {
      for (const style of Object.values(theme.type)) {
        if (style.fontFamily) expect(theme.fonts).toContain(style.fontFamily);
      }
      for (const key of theme.fonts) expect(bundled).toContain(`  ${key}: require(`);
    },
  );
});

describe('pickerFamilies (spec 0058, REQ-007)', () => {
  it('AC-017: "Markthalle" chosen: Markthalle, Klar, Frisch', () => {
    expect(ids(pickerFamilies('markthalle', false))).toEqual(['markthalle', 'klar', 'frisch']);
  });

  it('AC-016: "Wolke" chosen: Wolke first, then the order of the list', () => {
    expect(ids(pickerFamilies('wolke', false))).toEqual(['wolke', 'markthalle', 'klar']);
  });

  it('AC-018: all nine when expanded, the chosen one first', () => {
    const all = ids(pickerFamilies('espresso', true));
    expect(all).toHaveLength(9);
    expect(all[0]).toBe('espresso');
    expect(all.slice(1)).toEqual(ids(themeFamilies).filter((id) => id !== 'espresso'));
  });

  it('an unknown chosen id shows the plain order', () => {
    expect(ids(pickerFamilies('gibt-es-nicht', false))).toEqual(['markthalle', 'klar', 'frisch']);
  });
});
