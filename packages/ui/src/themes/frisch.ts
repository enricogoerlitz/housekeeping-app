import type {
  Theme,
  ThemeColors,
  ThemeFamily,
  ThemeShape,
  TextVariant,
  TextVariantStyle,
} from './types';

// "Frisch": bold, big round tiles, one row per tile. Calm since spec 0005 (D4): one muted area
// colour per screen, white tiles on a warm ground, ink everywhere else.

const display = 'BricolageGrotesque_700Bold';
const displayHeavy = 'BricolageGrotesque_800ExtraBold';
const ui = 'DMSans_400Regular';
const uiMedium = 'DMSans_500Medium';
const uiStrong = 'DMSans_600SemiBold';

const type: Record<TextVariant, TextVariantStyle> = {
  display: { fontFamily: displayHeavy, fontSize: 40, lineHeight: 43, letterSpacing: -1.2 },
  title: { fontFamily: displayHeavy, fontSize: 33, lineHeight: 36, letterSpacing: -1 },
  heading: { fontFamily: display, fontSize: 22, lineHeight: 26, letterSpacing: -0.45 },
  cardTitle: { fontFamily: display, fontSize: 19, lineHeight: 23, letterSpacing: -0.3 },
  rowTitle: { fontFamily: uiMedium, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: ui, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: uiStrong, fontSize: 16, lineHeight: 22 },
  small: { fontFamily: ui, fontSize: 13.5, lineHeight: 18 },
  smallStrong: { fontFamily: uiStrong, fontSize: 13.5, lineHeight: 18 },
  caption: { fontFamily: ui, fontSize: 12.5, lineHeight: 16 },
  sectionLabel: { fontFamily: display, fontSize: 22, lineHeight: 26, letterSpacing: -0.45 },
  groupLabel: { fontFamily: display, fontSize: 16, lineHeight: 20, letterSpacing: -0.2 },
  button: { fontFamily: uiStrong, fontSize: 15, lineHeight: 20 },
  tab: { fontFamily: uiMedium, fontSize: 10.5, lineHeight: 13 },
};

const shape: ThemeShape = {
  radius: {
    card: 22,
    tile: 28,
    control: 14,
    button: 999,
    check: 8,
    fab: 22,
    input: 999,
    chip: 999,
    sheet: 28,
    photo: 14,
  },
  stroke: 2.2,
  gutter: 16,
  section: 'plain',
  list: 'tile',
  media: 'thumbRow',
  cardBorder: false,
  checkBorderWidth: 2,
  tabActive: 'pill',
  areaTone: true,
};

const light: ThemeColors = {
  bg: '#FAF8F5',
  surface: '#FFFFFF',
  surfaceSunken: '#F0ECE6',
  surfaceRaised: '#FFFFFF',
  shadowRaised: '0px 10px 28px rgba(21,21,27,0.18), 0px 2px 6px rgba(21,21,27,0.12)',
  border: '#E7E1D8',
  text: '#15151B',
  textMuted: '#5E5B66',
  accent: '#15151B',
  onAccent: '#FFFFFF',
  accentSoft: '#F0ECE6',
  success: '#12855A',
  onSuccess: '#FFFFFF',
  // Concept value #C9961C, darkened to 3:1 on white (AC-051).
  star: '#B8891A',
  due: '#7085DB',
  warnBg: '#FFE3B3',
  warnText: '#5A3500',
  checkLine: '#15151B',
  barBg: '#FFFFFF',
  scrim: 'rgba(21,21,27,0.45)',
  fabBg: '#15151B',
  fabText: '#FFFFFF',
  tones: {
    essen: { bg: '#F5E3DB', fg: '#5C1A08' },
    plan: { bg: '#F3EACB', fg: '#4D3800' },
    liste: { bg: '#DCEDE3', fg: '#0B3F2A' },
    haushalt: { bg: '#E0E5F4', fg: '#1B2A6E' },
    ki: { bg: '#EBE4F8', fg: '#3A1C8C' },
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
  bg: '#111116',
  surface: '#1D1D25',
  surfaceSunken: '#2A2A34',
  surfaceRaised: '#2A2A34',
  shadowRaised:
    '0px 0px 0px 1px rgba(255,255,255,0.12), 0px 12px 32px rgba(0,0,0,0.6), 0px 2px 6px rgba(0,0,0,0.4)',
  border: '#33333F',
  text: '#F6F5F2',
  textMuted: '#A9A6B3',
  accent: '#F6F5F2',
  onAccent: '#15151B',
  accentSoft: '#2A2A34',
  success: '#5ADBA6',
  onSuccess: '#111116',
  star: '#FFD24A',
  due: '#A5B1E8',
  warnBg: '#4A3408',
  warnText: '#FFD48A',
  checkLine: '#F6F5F2',
  barBg: '#1D1D25',
  scrim: 'rgba(0,0,0,0.6)',
  fabBg: '#F6F5F2',
  fabText: '#15151B',
  tones: {
    essen: { bg: '#41251E', fg: '#F2D4CC' },
    plan: { bg: '#3D3315', fg: '#EADAAB' },
    liste: { bg: '#18352A', fg: '#B5E1CD' },
    haushalt: { bg: '#2B3355', fg: '#D2D9F4' },
    ki: { bg: '#352C51', fg: '#DED6F5' },
  },
  kinds: {
    recipe: '#E48A66',
    collection: '#D49AC4',
    restaurant: '#D9A93A',
    activity: '#9DBE72',
    chore: '#9A9AA2',
  },
};

const fonts = [display, displayHeavy, ui, uiMedium, uiStrong];
const base = {
  id: 'frisch' as const,
  name: 'Frisch',
  description: 'Mutig und ruhig, jeder Bereich hat seine Farbe.',
  type,
  shape,
  fonts,
};

export const frisch: ThemeFamily = {
  id: base.id,
  name: base.name,
  description: base.description,
  light: { ...base, mode: 'light', colors: light } satisfies Theme,
  dark: { ...base, mode: 'dark', colors: dark } satisfies Theme,
};
