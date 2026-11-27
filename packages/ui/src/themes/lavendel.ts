import type {
  Theme,
  ThemeColors,
  ThemeFamily,
  ThemeShape,
  TextVariant,
  TextVariantStyle,
} from './types';

// "Lavendel" (spec 0058): airy and quiet, violet on a pale lilac ground; Lexend throughout,
// soft round cards without borders.

const display = 'Lexend_600SemiBold';
const ui = 'Lexend_400Regular';
const uiMedium = 'Lexend_500Medium';
const uiStrong = 'Lexend_600SemiBold';

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
  groupLabel: { fontFamily: 'Lexend_500Medium', fontSize: 17, lineHeight: 22 },
  button: { fontFamily: uiStrong, fontSize: 15, lineHeight: 20 },
  tab: { fontFamily: uiMedium, fontSize: 10.5, lineHeight: 13 },
};

const shape: ThemeShape = {
  radius: {
    card: 20,
    tile: 20,
    control: 12,
    button: 14,
    check: 999,
    fab: 20,
    input: 14,
    chip: 999,
    sheet: 24,
    photo: 14,
  },
  stroke: 1.7,
  gutter: 18,
  section: 'plain',
  list: 'grouped',
  media: 'photoTop',
  cardBorder: false,
  checkBorderWidth: 1.7,
  tabActive: 'tint',
  areaTone: false,
};

const light: ThemeColors = {
  bg: '#F4F1F9',
  surface: '#FFFFFF',
  surfaceSunken: '#E9E3F3',
  surfaceRaised: '#FFFFFF',
  shadowRaised: '0px 10px 28px rgba(34,26,51,0.20), 0px 2px 6px rgba(34,26,51,0.14)',
  border: '#DDD5EA',
  text: '#221A33',
  textMuted: '#5E5573',
  accent: '#5B3FA0',
  onAccent: '#FFFFFF',
  accentSoft: '#E6DDF6',
  success: '#2F7A5E',
  onSuccess: '#FFFFFF',
  star: '#9C6B00',
  due: '#9C6B00',
  warnBg: '#FBE6C8',
  warnText: '#774400',
  changedBg: '#FFF3C4',
  removedText: '#A8231C',
  checkLine: '#B3A9C6',
  switchOff: '#8E84A3',
  barBg: '#F4F1F9',
  scrim: 'rgba(34,26,51,0.45)',
  fabBg: '#5B3FA0',
  fabText: '#FFFFFF',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  tones: {
    essen: { bg: '#F5E0E4', fg: '#8A3016' },
    plan: { bg: '#F4EACD', fg: '#6B4A00' },
    liste: { bg: '#DCEEE4', fg: '#3A552A' },
    haushalt: { bg: '#E1E6F6', fg: '#2A4A63' },
    ki: { bg: '#EADFF6', fg: '#5A3566' },
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
  bg: '#17131F',
  surface: '#211B2C',
  surfaceSunken: '#2B2439',
  surfaceRaised: '#322A42',
  shadowRaised:
    '0px 0px 0px 1px rgba(255,255,255,0.12), 0px 12px 32px rgba(0,0,0,0.6), 0px 2px 6px rgba(0,0,0,0.4)',
  border: '#3A3149',
  text: '#F1EDF8',
  textMuted: '#B4AAC8',
  accent: '#C4AEF5',
  onAccent: '#241443',
  accentSoft: '#362A55',
  success: '#86D1AE',
  onSuccess: '#17131F',
  star: '#E8C060',
  due: '#E8C060',
  warnBg: '#47320F',
  warnText: '#F5CB85',
  changedBg: '#3B3515',
  removedText: '#FF9A8F',
  checkLine: '#5F5575',
  switchOff: '#7A6F92',
  barBg: '#17131F',
  scrim: 'rgba(0,0,0,0.6)',
  fabBg: '#C4AEF5',
  fabText: '#241443',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  tones: {
    essen: { bg: '#44283A', fg: '#F6C2AC' },
    plan: { bg: '#403719', fg: '#F2D58E' },
    liste: { bg: '#1E3A30', fg: '#C5DBB0' },
    haushalt: { bg: '#252E4D', fg: '#B6D0E4' },
    ki: { bg: '#362A55', fg: '#DDC3E6' },
  },
  kinds: {
    recipe: '#E48A66',
    collection: '#D49AC4',
    restaurant: '#D9A93A',
    activity: '#9DBE72',
    chore: '#9A9AA2',
  },
};

const fonts = ['Lexend_600SemiBold', 'Lexend_400Regular', 'Lexend_500Medium'];
const base = {
  id: 'lavendel' as const,
  name: 'Lavendel',
  description: 'Luftig und still, wie ein Lavendelfeld am Abend.',
  type,
  shape,
  fonts,
};

export const lavendel: ThemeFamily = {
  id: base.id,
  name: base.name,
  description: base.description,
  light: { ...base, mode: 'light', colors: light } satisfies Theme,
  dark: { ...base, mode: 'dark', colors: dark } satisfies Theme,
};
