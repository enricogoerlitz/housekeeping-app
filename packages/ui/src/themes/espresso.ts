import type {
  Theme,
  ThemeColors,
  ThemeFamily,
  ThemeShape,
  TextVariant,
  TextVariantStyle,
} from './types';

// "Espresso" (spec 0058): dark roast with crema and caramel, like a small café; dark is its main
// mode, light a cool milk-foam grey with espresso ink. Angular: small radii, square check boxes.

const display = 'SpaceGrotesk_700Bold';
const ui = 'Manrope_500Medium';
const uiMedium = 'Manrope_600SemiBold';
const uiStrong = 'Manrope_700Bold';

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
  groupLabel: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 17, lineHeight: 22 },
  button: { fontFamily: uiStrong, fontSize: 15, lineHeight: 20 },
  tab: { fontFamily: uiMedium, fontSize: 10.5, lineHeight: 13 },
};

const shape: ThemeShape = {
  radius: {
    card: 8,
    tile: 8,
    control: 6,
    button: 6,
    check: 4,
    fab: 12,
    input: 8,
    chip: 6,
    sheet: 16,
    photo: 6,
  },
  stroke: 1.8,
  gutter: 20,
  section: 'plain',
  list: 'hairline',
  media: 'thumbRow',
  cardBorder: true,
  checkBorderWidth: 1.8,
  tabActive: 'tint',
  areaTone: false,
};

const light: ThemeColors = {
  bg: '#EEEAE6',
  surface: '#FBFAF8',
  surfaceSunken: '#E2DCD5',
  surfaceRaised: '#FFFFFF',
  shadowRaised: '0px 10px 28px rgba(30,22,18,0.20), 0px 2px 6px rgba(30,22,18,0.14)',
  border: '#D6CEC5',
  text: '#1E1612',
  textMuted: '#5F534B',
  accent: '#3B2418',
  onAccent: '#F5EBDD',
  accentSoft: '#E6D9CB',
  success: '#2D6B66',
  onSuccess: '#FFFFFF',
  star: '#9A6A12',
  due: '#9A6A12',
  warnBg: '#F8E3C4',
  warnText: '#733F00',
  changedBg: '#F7EDC4',
  removedText: '#A8231C',
  checkLine: '#ADA297',
  switchOff: '#8B8075',
  barBg: '#EEEAE6',
  scrim: 'rgba(30,22,18,0.45)',
  fabBg: '#3B2418',
  fabText: '#F5EBDD',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  tones: {
    essen: { bg: '#EED9CC', fg: '#8A3016' },
    plan: { bg: '#EFE3C6', fg: '#6B4A00' },
    liste: { bg: '#D9E6DF', fg: '#3A552A' },
    haushalt: { bg: '#DCE2EA', fg: '#2A4A63' },
    ki: { bg: '#E5DDEA', fg: '#5A3566' },
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
  bg: '#120D0A',
  surface: '#1D1612',
  surfaceSunken: '#281F19',
  surfaceRaised: '#30251E',
  shadowRaised:
    '0px 0px 0px 1px rgba(255,255,255,0.12), 0px 12px 32px rgba(0,0,0,0.6), 0px 2px 6px rgba(0,0,0,0.4)',
  border: '#362A22',
  text: '#F3E9DD',
  textMuted: '#B9A897',
  accent: '#D9A46A',
  onAccent: '#23140A',
  accentSoft: '#3D2B1C',
  success: '#8FC9B8',
  onSuccess: '#120D0A',
  star: '#E7B65A',
  due: '#E7B65A',
  warnBg: '#452F12',
  warnText: '#F3C686',
  changedBg: '#3A3215',
  removedText: '#FF9A8F',
  checkLine: '#5E4D40',
  switchOff: '#7A6757',
  barBg: '#120D0A',
  scrim: 'rgba(0,0,0,0.6)',
  fabBg: '#D9A46A',
  fabText: '#23140A',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  tones: {
    essen: { bg: '#45281C', fg: '#F6C2AC' },
    plan: { bg: '#3F3318', fg: '#F2D58E' },
    liste: { bg: '#1F3530', fg: '#C5DBB0' },
    haushalt: { bg: '#232C3A', fg: '#B6D0E4' },
    ki: { bg: '#33283D', fg: '#DDC3E6' },
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
  'SpaceGrotesk_700Bold',
  'Manrope_500Medium',
  'Manrope_600SemiBold',
  'Manrope_700Bold',
  'SpaceGrotesk_500Medium',
];
const base = {
  id: 'espresso' as const,
  name: 'Espresso',
  description: 'Dunkel geröstet, mit Crema und Karamell, wie ein kleines Café.',
  type,
  shape,
  fonts,
};

export const espresso: ThemeFamily = {
  id: base.id,
  name: base.name,
  description: base.description,
  light: { ...base, mode: 'light', colors: light } satisfies Theme,
  dark: { ...base, mode: 'dark', colors: dark } satisfies Theme,
};
