import type {
  Theme,
  ThemeColors,
  ThemeFamily,
  ThemeShape,
  TextVariant,
  TextVariantStyle,
} from './types';

// "Frisch": bold and colourful. Every app area has its own colour; big round tiles.

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
  section: 'tile',
  list: 'tile',
  media: 'thumbRow',
  cardBorder: false,
  checkBorderWidth: 2,
  tabActive: 'pill',
};

const light: ThemeColors = {
  bg: '#FAF8F5',
  surface: '#FFFFFF',
  surfaceSunken: '#F0ECE6',
  border: '#E7E1D8',
  text: '#15151B',
  textMuted: '#5E5B66',
  accent: '#15151B',
  onAccent: '#FFFFFF',
  accentSoft: '#F0ECE6',
  success: '#12855A',
  onSuccess: '#FFFFFF',
  star: '#F2B807',
  due: '#4C6FFF',
  warnBg: '#FFE3B3',
  warnText: '#5A3500',
  checkLine: '#15151B',
  barBg: '#FFFFFF',
  scrim: 'rgba(21,21,27,0.45)',
  fabBg: '#7C4DFF',
  fabText: '#FFFFFF',
  tones: {
    essen: { bg: '#FFD9CC', fg: '#5C1A08' },
    plan: { bg: '#FFE9A8', fg: '#4D3800' },
    liste: { bg: '#CFF3E0', fg: '#0B3F2A' },
    haushalt: { bg: '#D9E2FF', fg: '#1B2A6E' },
    ki: { bg: '#E9DDFF', fg: '#3A1C8C' },
  },
};

const dark: ThemeColors = {
  bg: '#111116',
  surface: '#1D1D25',
  surfaceSunken: '#2A2A34',
  border: '#33333F',
  text: '#F6F5F2',
  textMuted: '#A9A6B3',
  accent: '#F6F5F2',
  onAccent: '#15151B',
  accentSoft: '#2A2A34',
  success: '#5ADBA6',
  onSuccess: '#111116',
  star: '#FFD24A',
  due: '#8EA2FF',
  warnBg: '#4A3408',
  warnText: '#FFD48A',
  checkLine: '#F6F5F2',
  barBg: '#1D1D25',
  scrim: 'rgba(0,0,0,0.6)',
  fabBg: '#7F56FA',
  fabText: '#FFFFFF',
  tones: {
    essen: { bg: '#4D1E12', fg: '#FFCDBF' },
    plan: { bg: '#4A3A08', fg: '#FFE596' },
    liste: { bg: '#0E3F2C', fg: '#A6F0CE' },
    haushalt: { bg: '#1D2A63', fg: '#C7D2FF' },
    ki: { bg: '#2E1F5E', fg: '#D9CCFF' },
  },
};

const fonts = [display, displayHeavy, ui, uiMedium, uiStrong];
const base = {
  id: 'frisch' as const,
  name: 'Frisch',
  description: 'Mutig und farbig, jeder Bereich hat seine Farbe.',
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
