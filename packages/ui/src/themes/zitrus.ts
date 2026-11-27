import type {
  Theme,
  ThemeColors,
  ThemeFamily,
  ThemeShape,
  TextVariant,
  TextVariantStyle,
} from './types';

// "Zitrus" (spec 0058): summery and playful, cobalt on cream with lemon and tangerine. One
// geometric typeface, round shapes.

const display = 'Outfit_700Bold';
const ui = 'Outfit_400Regular';
const uiMedium = 'Outfit_500Medium';
const uiStrong = 'Outfit_600SemiBold';

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
  groupLabel: { fontFamily: 'Outfit_600SemiBold', fontSize: 17, lineHeight: 22 },
  button: { fontFamily: uiStrong, fontSize: 15, lineHeight: 20 },
  tab: { fontFamily: uiMedium, fontSize: 10.5, lineHeight: 13 },
};

const shape: ThemeShape = {
  radius: {
    card: 20,
    tile: 20,
    control: 14,
    button: 14,
    check: 999,
    fab: 20,
    input: 14,
    chip: 999,
    sheet: 24,
    photo: 14,
  },
  stroke: 2,
  gutter: 16,
  section: 'plain',
  list: 'grouped',
  media: 'photoTop',
  cardBorder: false,
  checkBorderWidth: 2,
  tabActive: 'tint',
  areaTone: false,
};

const light: ThemeColors = {
  bg: '#FFF8EC',
  surface: '#FFFFFF',
  surfaceSunken: '#FBEFD8',
  surfaceRaised: '#FFFFFF',
  shadowRaised: '0px 10px 28px rgba(27,30,51,0.20), 0px 2px 6px rgba(27,30,51,0.14)',
  border: '#F0E2C6',
  text: '#1B1E33',
  textMuted: '#585D78',
  accent: '#2C4BD6',
  onAccent: '#FFFFFF',
  accentSoft: '#DFE5FB',
  success: '#287A44',
  onSuccess: '#FFFFFF',
  star: '#B57A00',
  due: '#B57A00',
  warnBg: '#FFE3C7',
  warnText: '#7A3A00',
  changedBg: '#FFF2B8',
  removedText: '#A8231C',
  checkLine: '#C9BB9E',
  switchOff: '#9A8E78',
  barBg: '#FFF8EC',
  scrim: 'rgba(27,30,51,0.45)',
  fabBg: '#2C4BD6',
  fabText: '#FFFFFF',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  tones: {
    essen: { bg: '#FFDCC8', fg: '#8A3016' },
    plan: { bg: '#FFEFA8', fg: '#6B4A00' },
    liste: { bg: '#D3F0D9', fg: '#3A552A' },
    haushalt: { bg: '#DFE5FB', fg: '#2A4A63' },
    ki: { bg: '#F0DDF8', fg: '#5A3566' },
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
  bg: '#12131C',
  surface: '#1B1D2A',
  surfaceSunken: '#252838',
  surfaceRaised: '#2C3043',
  shadowRaised:
    '0px 0px 0px 1px rgba(255,255,255,0.12), 0px 12px 32px rgba(0,0,0,0.6), 0px 2px 6px rgba(0,0,0,0.4)',
  border: '#2F3346',
  text: '#F3F1EA',
  textMuted: '#AEB1C6',
  accent: '#93A6FF',
  onAccent: '#10183D',
  accentSoft: '#27305A',
  success: '#7BD497',
  onSuccess: '#12131C',
  star: '#FFC94D',
  due: '#FFC94D',
  warnBg: '#47300F',
  warnText: '#FFCB8A',
  changedBg: '#3D3714',
  removedText: '#FF9A8F',
  checkLine: '#555A73',
  switchOff: '#6C718C',
  barBg: '#12131C',
  scrim: 'rgba(0,0,0,0.6)',
  fabBg: '#93A6FF',
  fabText: '#10183D',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  tones: {
    essen: { bg: '#4A2C1E', fg: '#F6C2AC' },
    plan: { bg: '#47400F', fg: '#F2D58E' },
    liste: { bg: '#1D3E2A', fg: '#C5DBB0' },
    haushalt: { bg: '#27305A', fg: '#B6D0E4' },
    ki: { bg: '#3C2A4A', fg: '#DDC3E6' },
  },
  kinds: {
    recipe: '#E48A66',
    collection: '#D49AC4',
    restaurant: '#D9A93A',
    activity: '#9DBE72',
    chore: '#9A9AA2',
  },
};

const fonts = ['Outfit_700Bold', 'Outfit_400Regular', 'Outfit_500Medium', 'Outfit_600SemiBold'];
const base = {
  id: 'zitrus' as const,
  name: 'Zitrus',
  description: 'Sommerlich und verspielt: Kobalt, Zitrone, Mandarine.',
  type,
  shape,
  fonts,
};

export const zitrus: ThemeFamily = {
  id: base.id,
  name: base.name,
  description: base.description,
  light: { ...base, mode: 'light', colors: light } satisfies Theme,
  dark: { ...base, mode: 'dark', colors: dark } satisfies Theme,
};
