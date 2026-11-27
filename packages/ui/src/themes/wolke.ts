import type {
  Theme,
  ThemeColors,
  ThemeFamily,
  ThemeShape,
  TextVariant,
  TextVariantStyle,
} from './types';

// "Wolke" (spec 0058): a pink sky with white clouds, ink in mauve, everything round and soft.
// Nadja's wish, after her phone's home screen: icon buttons and the active tab sit on "bubbles".

const display = 'Nunito_800ExtraBold';
const ui = 'Nunito_500Medium';
const uiMedium = 'Nunito_600SemiBold';
const uiStrong = 'Nunito_700Bold';

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
  groupLabel: { fontFamily: 'Nunito_700Bold', fontSize: 17, lineHeight: 22 },
  button: { fontFamily: uiStrong, fontSize: 15, lineHeight: 20 },
  tab: { fontFamily: uiMedium, fontSize: 10.5, lineHeight: 13 },
};

const shape: ThemeShape = {
  radius: {
    card: 24,
    tile: 24,
    control: 16,
    button: 999,
    check: 999,
    fab: 999,
    input: 18,
    chip: 999,
    sheet: 28,
    photo: 16,
  },
  stroke: 1.8,
  gutter: 18,
  section: 'plain',
  list: 'grouped',
  media: 'photoTop',
  cardBorder: true,
  checkBorderWidth: 1.8,
  tabActive: 'bubble',
  areaTone: false,
  // Not quite round, like the icons on the home screen it comes from.
  bubble: {
    topLeft: '48% 55%',
    topRight: '52% 45%',
    bottomRight: '46% 55%',
    bottomLeft: '54% 45%',
  },
};

const light: ThemeColors = {
  bg: '#F2D3DB',
  surface: '#FCEEF1',
  surfaceSunken: '#F8DCE3',
  surfaceRaised: '#FFFFFF',
  shadowRaised: '0px 10px 28px rgba(74,50,54,0.20), 0px 2px 6px rgba(74,50,54,0.14)',
  border: '#EBC6CF',
  text: '#4A3236',
  textMuted: '#6E4E55',
  accent: '#5B3B41',
  onAccent: '#FDEFF2',
  accentSoft: '#F8DCE3',
  success: '#9B4D63',
  onSuccess: '#FFF8F9',
  star: '#A8741A',
  due: '#A8741A',
  warnBg: '#FBE3CF',
  warnText: '#7A3F12',
  changedBg: '#FFF1C9',
  removedText: '#A8231C',
  checkLine: '#BE98A1',
  switchOff: '#8E6A73',
  barBg: '#FCEEF1',
  scrim: 'rgba(74,50,54,0.45)',
  fabBg: '#5B3B41',
  fabText: '#FDEFF2',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  tones: {
    essen: { bg: '#F7D9DF', fg: '#8A3016' },
    plan: { bg: '#F6E5D4', fg: '#6B4A00' },
    liste: { bg: '#E3EBDF', fg: '#3A552A' },
    haushalt: { bg: '#E4E1F2', fg: '#2A4A63' },
    ki: { bg: '#EFDDF0', fg: '#5A3566' },
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
  bg: '#241A1D',
  surface: '#2F2327',
  surfaceSunken: '#3A2B30',
  surfaceRaised: '#413137',
  shadowRaised:
    '0px 0px 0px 1px rgba(255,255,255,0.12), 0px 12px 32px rgba(0,0,0,0.6), 0px 2px 6px rgba(0,0,0,0.4)',
  border: '#4A383E',
  text: '#F8E6EA',
  textMuted: '#C9AAB1',
  accent: '#F4B6C4',
  onAccent: '#3A2026',
  accentSoft: '#4F333B',
  success: '#E59DB1',
  onSuccess: '#2A1C20',
  star: '#E8BE63',
  due: '#E8BE63',
  warnBg: '#4A3218',
  warnText: '#F5C88A',
  changedBg: '#403717',
  removedText: '#FF9A8F',
  checkLine: '#7A5E66',
  switchOff: '#8A6E75',
  barBg: '#241A1D',
  scrim: 'rgba(0,0,0,0.6)',
  fabBg: '#F4B6C4',
  fabText: '#3A2026',
  badge: '#D70015',
  onBadge: '#FFFFFF',
  tones: {
    essen: { bg: '#4F333B', fg: '#F6C2AC' },
    plan: { bg: '#4A3A27', fg: '#F2D58E' },
    liste: { bg: '#33402F', fg: '#C5DBB0' },
    haushalt: { bg: '#363247', fg: '#B6D0E4' },
    ki: { bg: '#46304A', fg: '#DDC3E6' },
  },
  kinds: {
    recipe: '#E48A66',
    collection: '#D49AC4',
    restaurant: '#D9A93A',
    activity: '#9DBE72',
    chore: '#9A9AA2',
  },
};

// The sky behind the pages (web only): white clouds as soft radial gradients over a pink
// gradient that starts in `bg`, so the status bar and the top of the page are one colour. Every
// colour in it keeps the text pairs of `bg` (contrast.test.ts).
const cloud = (at: string, alpha: number) =>
  `radial-gradient(${at}, rgba(255,255,255,${alpha}) 0%, rgba(255,255,255,0) 70%)`;
const sky = [
  cloud('70% 22% at 15% 12%', 0.9),
  cloud('60% 18% at 90% 40%', 0.7),
  cloud('80% 25% at 0% 66%', 0.75),
  cloud('90% 30% at 100% 96%', 0.5),
  'linear-gradient(180deg, #F2D3DB 0%, #EEC8D2 60%, #F0CDD6 100%)',
].join(', ');
// "Mondnacht": a faint glow at the top right, where the moon would be.
const moonlight = 'radial-gradient(80% 40% at 85% 5%, #352530 0%, rgba(53,37,48,0) 60%)';

const fonts = ['Nunito_800ExtraBold', 'Nunito_500Medium', 'Nunito_600SemiBold', 'Nunito_700Bold'];
const base = {
  id: 'wolke' as const,
  name: 'Wolke',
  description: 'Rosa Wolkenhimmel, weiche Formen, Tinte in Mauve.',
  type,
  shape,
  fonts,
};

export const wolke: ThemeFamily = {
  id: base.id,
  name: base.name,
  description: base.description,
  light: { ...base, mode: 'light', colors: light, backdrop: sky } satisfies Theme,
  dark: { ...base, mode: 'dark', colors: dark, backdrop: moonlight } satisfies Theme,
};
