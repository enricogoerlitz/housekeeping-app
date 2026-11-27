import type {
  Theme,
  ThemeColors,
  ThemeFamily,
  ThemeShape,
  TextVariant,
  TextVariantStyle,
} from './types';

// "Mitternacht" (spec 0058): night blue with brass, made for the evening in the kitchen; dark is
// its main mode. A menu-card serif for titles, Inter for everything you operate.

const display = 'DMSerifDisplay_400Regular';
const ui = 'Inter_400Regular';
const uiMedium = 'Inter_500Medium';
const uiStrong = 'Inter_600SemiBold';

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
  groupLabel: { fontFamily: 'DMSerifDisplay_400Regular_Italic', fontSize: 17, lineHeight: 22 },
  button: { fontFamily: uiStrong, fontSize: 15, lineHeight: 20 },
  tab: { fontFamily: uiMedium, fontSize: 10.5, lineHeight: 13 },
};

const shape: ThemeShape = {
  radius: {
    card: 12,
    tile: 12,
    control: 10,
    button: 10,
    check: 999,
    fab: 16,
    input: 10,
    chip: 8,
    sheet: 20,
    photo: 8,
  },
  stroke: 1.6,
  gutter: 20,
  section: 'plain',
  list: 'hairline',
  media: 'thumbRow',
  cardBorder: true,
  checkBorderWidth: 1.6,
  tabActive: 'tint',
  areaTone: false,
};

const light: ThemeColors = {
  bg: '#F4F2EC',
  surface: '#FFFFFF',
  surfaceSunken: '#EAE6DC',
  surfaceRaised: '#FFFFFF',
  shadowRaised: '0px 10px 28px rgba(20,27,45,0.20), 0px 2px 6px rgba(20,27,45,0.14)',
  border: '#DDD8CB',
  text: '#141B2D',
  textMuted: '#55607A',
  accent: '#1F3A68',
  onAccent: '#F4F2EC',
  accentSoft: '#DCE3F0',
  success: '#2F6B55',
  onSuccess: '#FFFFFF',
  star: '#9A6F14',
  due: '#9A6F14',
  warnBg: '#F7E5C2',
  warnText: '#6E4600',
  changedBg: '#F8EEC2',
  removedText: '#A8231C',
  checkLine: '#A9A391',
  switchOff: '#8C8676',
  barBg: '#F4F2EC',
  scrim: 'rgba(20,27,45,0.45)',
  fabBg: '#1F3A68',
  fabText: '#F4F2EC',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  tones: {
    essen: { bg: '#F1E0D6', fg: '#8A3016' },
    plan: { bg: '#F2E8CC', fg: '#6B4A00' },
    liste: { bg: '#DCEBE2', fg: '#3A552A' },
    haushalt: { bg: '#DCE3F0', fg: '#2A4A63' },
    ki: { bg: '#E7E0F0', fg: '#5A3566' },
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
  bg: '#0E1322',
  surface: '#161D30',
  surfaceSunken: '#1E2740',
  surfaceRaised: '#243050',
  shadowRaised:
    '0px 0px 0px 1px rgba(255,255,255,0.12), 0px 12px 32px rgba(0,0,0,0.6), 0px 2px 6px rgba(0,0,0,0.4)',
  border: '#2A3552',
  text: '#EEF0F6',
  textMuted: '#A3ACC4',
  accent: '#E2B866',
  onAccent: '#1D1405',
  accentSoft: '#3A3220',
  success: '#7FC4A6',
  onSuccess: '#0E1322',
  star: '#E2B866',
  due: '#E2B866',
  warnBg: '#463513',
  warnText: '#F2CB82',
  changedBg: '#383418',
  removedText: '#FF9A8F',
  checkLine: '#4D5876',
  switchOff: '#66718F',
  barBg: '#0E1322',
  scrim: 'rgba(0,0,0,0.6)',
  fabBg: '#E2B866',
  fabText: '#1D1405',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  tones: {
    essen: { bg: '#3E2A26', fg: '#F6C2AC' },
    plan: { bg: '#3A3220', fg: '#F2D58E' },
    liste: { bg: '#1F3A32', fg: '#C5DBB0' },
    haushalt: { bg: '#22304F', fg: '#B6D0E4' },
    ki: { bg: '#33294A', fg: '#DDC3E6' },
  },
  kinds: {
    recipe: '#E48A66',
    collection: '#D49AC4',
    restaurant: '#D9A93A',
    activity: '#9DBE72',
    chore: '#9A9AA2',
  },
};

const fonts = [
  'DMSerifDisplay_400Regular',
  'Inter_400Regular',
  'Inter_500Medium',
  'Inter_600SemiBold',
  'DMSerifDisplay_400Regular_Italic',
];
const base = {
  id: 'mitternacht' as const,
  name: 'Mitternacht',
  description: 'Tiefblau mit Messing, gemacht für den Abend in der Küche.',
  type,
  shape,
  fonts,
};

export const mitternacht: ThemeFamily = {
  id: base.id,
  name: base.name,
  description: base.description,
  light: { ...base, mode: 'light', colors: light } satisfies Theme,
  dark: { ...base, mode: 'dark', colors: dark } satisfies Theme,
};
