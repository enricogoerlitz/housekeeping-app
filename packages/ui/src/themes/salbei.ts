import type {
  Theme,
  ThemeColors,
  ThemeFamily,
  ThemeShape,
  TextVariant,
  TextVariantStyle,
} from './types';

// "Salbei" (spec 0058): calm and natural like a herb garden; linen and sage, a cookbook serif for
// titles, square-ish check boxes.

const display = 'Lora_600SemiBold';
const ui = 'WorkSans_400Regular';
const uiMedium = 'WorkSans_500Medium';
const uiStrong = 'WorkSans_600SemiBold';

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
  groupLabel: { fontFamily: 'Lora_500Medium_Italic', fontSize: 17, lineHeight: 22 },
  button: { fontFamily: uiStrong, fontSize: 15, lineHeight: 20 },
  tab: { fontFamily: uiMedium, fontSize: 10.5, lineHeight: 13 },
};

const shape: ThemeShape = {
  radius: {
    card: 16,
    tile: 16,
    control: 10,
    button: 12,
    check: 6,
    fab: 18,
    input: 12,
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
  bg: '#F2F3EC',
  surface: '#FBFBF7',
  surfaceSunken: '#E6E9DD',
  surfaceRaised: '#FFFFFF',
  shadowRaised: '0px 10px 28px rgba(31,42,34,0.20), 0px 2px 6px rgba(31,42,34,0.14)',
  border: '#D7DCCB',
  text: '#1F2A22',
  textMuted: '#5A6555',
  accent: '#3D6A4D',
  onAccent: '#F4F7F0',
  accentSoft: '#DCE7DA',
  success: '#4C7A3A',
  onSuccess: '#F4F7F0',
  star: '#9C7012',
  due: '#9C7012',
  warnBg: '#F6E6C4',
  warnText: '#6E4600',
  changedBg: '#F7EFC3',
  removedText: '#A8231C',
  checkLine: '#A7B09A',
  switchOff: '#858D7A',
  barBg: '#F2F3EC',
  scrim: 'rgba(31,42,34,0.45)',
  fabBg: '#3D6A4D',
  fabText: '#F4F7F0',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  tones: {
    essen: { bg: '#F0E0D2', fg: '#8A3016' },
    plan: { bg: '#EEE8C9', fg: '#6B4A00' },
    liste: { bg: '#DCE7DA', fg: '#3A552A' },
    haushalt: { bg: '#DDE4E6', fg: '#2A4A63' },
    ki: { bg: '#E6E0EC', fg: '#5A3566' },
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
  bg: '#131A15',
  surface: '#1B241D',
  surfaceSunken: '#243026',
  surfaceRaised: '#2B382D',
  shadowRaised:
    '0px 0px 0px 1px rgba(255,255,255,0.12), 0px 12px 32px rgba(0,0,0,0.6), 0px 2px 6px rgba(0,0,0,0.4)',
  border: '#334036',
  text: '#E9EFE6',
  textMuted: '#A9B6A6',
  accent: '#93C7A2',
  onAccent: '#10261A',
  accentSoft: '#26402F',
  success: '#A6CB8C',
  onSuccess: '#131A15',
  star: '#E0B85A',
  due: '#E0B85A',
  warnBg: '#463513',
  warnText: '#F2CB82',
  changedBg: '#3A3716',
  removedText: '#FF9A8F',
  checkLine: '#5D6B5E',
  switchOff: '#6F7D6F',
  barBg: '#131A15',
  scrim: 'rgba(0,0,0,0.6)',
  fabBg: '#93C7A2',
  fabText: '#10261A',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  tones: {
    essen: { bg: '#43301F', fg: '#F6C2AC' },
    plan: { bg: '#3F3A1C', fg: '#F2D58E' },
    liste: { bg: '#26402F', fg: '#C5DBB0' },
    haushalt: { bg: '#22363B', fg: '#B6D0E4' },
    ki: { bg: '#352C40', fg: '#DDC3E6' },
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
  'Lora_600SemiBold',
  'WorkSans_400Regular',
  'WorkSans_500Medium',
  'WorkSans_600SemiBold',
  'Lora_500Medium_Italic',
];
const base = {
  id: 'salbei' as const,
  name: 'Salbei',
  description: 'Ruhig und natürlich, wie ein Kräutergarten am Morgen.',
  type,
  shape,
  fonts,
};

export const salbei: ThemeFamily = {
  id: base.id,
  name: base.name,
  description: base.description,
  light: { ...base, mode: 'light', colors: light } satisfies Theme,
  dark: { ...base, mode: 'dark', colors: dark } satisfies Theme,
};
