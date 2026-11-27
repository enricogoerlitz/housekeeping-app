import type {
  Theme,
  ThemeColors,
  ThemeFamily,
  ThemeShape,
  TextVariant,
  TextVariantStyle,
} from './types';

// "Markthalle": warm paper, terracotta, a serif for titles. Fine lines instead of shadows.

const display = 'Fraunces_600SemiBold';
const ui = 'InstrumentSans_400Regular';
const uiMedium = 'InstrumentSans_500Medium';
const uiStrong = 'InstrumentSans_600SemiBold';

const type: Record<TextVariant, TextVariantStyle> = {
  display: { fontFamily: display, fontSize: 36, lineHeight: 40, letterSpacing: -0.5 },
  title: { fontFamily: display, fontSize: 30, lineHeight: 34, letterSpacing: -0.45 },
  heading: { fontFamily: display, fontSize: 21, lineHeight: 26, letterSpacing: -0.2 },
  cardTitle: { fontFamily: display, fontSize: 19, lineHeight: 23, letterSpacing: -0.15 },
  rowTitle: { fontFamily: uiMedium, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: ui, fontSize: 16, lineHeight: 22 },
  reading: { fontFamily: ui, fontSize: 20, lineHeight: 31 },
  readingLarge: { fontFamily: ui, fontSize: 26, lineHeight: 40 },
  bodyStrong: { fontFamily: uiStrong, fontSize: 16, lineHeight: 22 },
  small: { fontFamily: ui, fontSize: 13.5, lineHeight: 18 },
  smallStrong: { fontFamily: uiStrong, fontSize: 13.5, lineHeight: 18 },
  caption: { fontFamily: ui, fontSize: 12.5, lineHeight: 16 },
  sectionLabel: { fontFamily: display, fontSize: 21, lineHeight: 26, letterSpacing: -0.2 },
  groupLabel: { fontFamily: 'Fraunces_500Medium_Italic', fontSize: 17, lineHeight: 22 },
  button: { fontFamily: uiStrong, fontSize: 15, lineHeight: 20 },
  tab: { fontFamily: uiMedium, fontSize: 10.5, lineHeight: 13 },
};

const shape: ThemeShape = {
  radius: {
    card: 14,
    tile: 14,
    control: 10,
    button: 10,
    check: 13,
    fab: 18,
    input: 14,
    chip: 999,
    sheet: 22,
    photo: 10,
  },
  stroke: 1.6,
  gutter: 20,
  section: 'plain',
  list: 'hairline',
  media: 'photoTop',
  cardBorder: true,
  checkBorderWidth: 1.6,
  tabActive: 'tint',
  areaTone: false,
};

const light: ThemeColors = {
  bg: '#FAF6EE',
  surface: '#FFFDF9',
  surfaceSunken: '#F1E9DA',
  surfaceRaised: '#FFFDF9',
  shadowRaised: '0px 10px 28px rgba(43,33,25,0.20), 0px 2px 6px rgba(43,33,25,0.14)',
  border: '#E4D9C6',
  text: '#2B2119',
  textMuted: '#6F6152',
  accent: '#B4411F',
  onAccent: '#FFF9F2',
  accentSoft: '#F5DFD3',
  success: '#4F6F3A',
  onSuccess: '#FAF6EE',
  star: '#C98A1B',
  due: '#C98A1B',
  warnBg: '#FBE7C2',
  warnText: '#774700',
  changedBg: '#FCF0C4',
  removedText: '#A8231C',
  checkLine: '#B5A68F',
  switchOff: '#95897C',
  barBg: '#FAF6EE',
  scrim: 'rgba(43,33,25,0.45)',
  fabBg: '#B4411F',
  fabText: '#FFF9F2',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  tones: {
    essen: { bg: '#F5DFD3', fg: '#8A3016' },
    plan: { bg: '#F6E7C4', fg: '#6B4A00' },
    liste: { bg: '#E3EAD8', fg: '#3A552A' },
    haushalt: { bg: '#DDE7EE', fg: '#2A4A63' },
    ki: { bg: '#EBE1EE', fg: '#5A3566' },
  },
  kinds: {
    recipe: '#B4532A',
    collection: '#8A4A7A',
    restaurant: '#9A6400',
    activity: '#4F6B2E',
    chore: '#6E6E73',
  },
};

const dark: ThemeColors = {
  bg: '#1B1613',
  surface: '#251F1A',
  surfaceSunken: '#30281F',
  surfaceRaised: '#342B24',
  shadowRaised:
    '0px 0px 0px 1px rgba(255,255,255,0.12), 0px 12px 32px rgba(0,0,0,0.6), 0px 2px 6px rgba(0,0,0,0.4)',
  border: '#3D3329',
  text: '#F4ECDF',
  textMuted: '#B5A691',
  accent: '#EC8A66',
  onAccent: '#2A1108',
  accentSoft: '#4B2A1D',
  success: '#A9C48F',
  onSuccess: '#1B1613',
  star: '#E3B04B',
  due: '#E3B04B',
  warnBg: '#4A3511',
  warnText: '#F6CC80',
  changedBg: '#3F3613',
  removedText: '#FF9A8F',
  checkLine: '#6E6152',
  switchOff: '#776C5F',
  barBg: '#1B1613',
  scrim: 'rgba(0,0,0,0.6)',
  fabBg: '#EC8A66',
  fabText: '#2A1108',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  tones: {
    essen: { bg: '#4B2A1D', fg: '#F6C2AC' },
    plan: { bg: '#463710', fg: '#F2D58E' },
    liste: { bg: '#2B3A22', fg: '#C5DBB0' },
    haushalt: { bg: '#22323F', fg: '#B6D0E4' },
    ki: { bg: '#3A2A40', fg: '#DDC3E6' },
  },
  kinds: {
    recipe: '#E48A66',
    collection: '#D49AC4',
    restaurant: '#D9A93A',
    activity: '#9DBE72',
    chore: '#9A9AA2',
  },
};

const fonts = [display, ui, uiMedium, uiStrong, 'Fraunces_500Medium_Italic'];
const base = {
  id: 'markthalle' as const,
  name: 'Markthalle',
  description: 'Warm und appetitlich, wie ein gutes Kochbuch.',
  type,
  shape,
  fonts,
};

export const markthalle: ThemeFamily = {
  id: base.id,
  name: base.name,
  description: base.description,
  light: { ...base, mode: 'light', colors: light } satisfies Theme,
  dark: { ...base, mode: 'dark', colors: dark } satisfies Theme,
};
