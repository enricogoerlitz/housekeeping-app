// Theme contract. Pure data: no React Native imports, so themes can be tested in Node.

export type ThemeId = 'markthalle' | 'klar' | 'frisch';
export type ColorMode = 'light' | 'dark';
/** Colour worlds of the app areas. Only the theme "Frisch" shows them (see `areaTone`). */
export type Tone = 'essen' | 'plan' | 'liste' | 'haushalt' | 'ki';
/**
 * Kinds of calendar entries (spec 0010, D19). Their colour is only ever a 3 px edge or a dot,
 * never a fill, so it is held to the 3:1 of graphics, not to the text ratio.
 */
export type KindColor = 'recipe' | 'collection' | 'restaurant' | 'activity' | 'chore';
export const KIND_COLORS: KindColor[] = ['recipe', 'collection', 'restaurant', 'activity', 'chore'];

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceSunken: string;
  /** What floats above the page, e.g. the dragged entry; lighter than `surface` in dark mode. */
  surfaceRaised: string;
  /** The CSS box-shadow of a raised surface; in dark mode with a faint light rim. */
  shadowRaised: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  success: string;
  onSuccess: string;
  star: string;
  due: string;
  /** Offline and "needs attention" hints: orange, never red. */
  warnBg: string;
  warnText: string;
  checkLine: string;
  /** The track of a switch that is off: 3:1 on page and card (spec 0031, REQ-035). */
  switchOff: string;
  /** Tab bar, sidebar and composer background. */
  barBg: string;
  scrim: string;
  fabBg: string;
  fabText: string;
  /**
   * The red circle with the number of open notices on the bell (spec 0051): the only red of the
   * app, by the owner's wish; never for hints, errors or anything overdue.
   */
  badge: string;
  onBadge: string;
  tones: Record<Tone, { bg: string; fg: string }>;
  /** Terrakotta, Pflaume, Ocker, Moos, Grau (spec 0010, D19). */
  kinds: Record<KindColor, string>;
}

export type FontWeight = '400' | '500' | '600' | '700' | '800';

export interface TextVariantStyle {
  /** Undefined = the platform's system font. */
  fontFamily?: string;
  /** Only used with the system font; custom fonts carry their weight in the family name. */
  fontWeight?: FontWeight;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
  fontStyle?: 'italic';
}

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'cardTitle'
  | 'rowTitle'
  | 'body'
  /** Long text to read at a distance, e.g. a step of the cooking mode (spec 0023): UI font. */
  | 'reading'
  /** `reading` on wide screens. */
  | 'readingLarge'
  | 'bodyStrong'
  | 'small'
  | 'smallStrong'
  | 'caption'
  | 'sectionLabel'
  | 'groupLabel'
  | 'button'
  | 'tab';

export interface ThemeShape {
  radius: {
    card: number;
    tile: number;
    control: number;
    button: number;
    check: number;
    fab: number;
    input: number;
    chip: number;
    sheet: number;
    photo: number;
  };
  /** Icon stroke width. */
  stroke: number;
  /** Horizontal page padding on phones. */
  gutter: number;
  /** How a titled block is framed: bare, or with a muted label above a group. */
  section: 'plain' | 'grouped';
  /** How list rows are separated: hairlines, one grouped card, or one tile per row. */
  list: 'hairline' | 'grouped' | 'tile';
  /** Picture cards: photo on top, or a thumbnail next to the text. */
  media: 'photoTop' | 'thumbRow';
  /** Cards and inputs get a hairline border. */
  cardBorder: boolean;
  checkBorderWidth: number;
  /** Active tab: tinted icon and label, or an ink pill behind the icon. */
  tabActive: 'tint' | 'pill';
  /**
   * One area colour per screen (spec 0005, D4): the area of the screen colours its primary
   * button, its header's filled icon button and the line under the active view tab. Off = accent.
   */
  areaTone: boolean;
}

export interface Theme {
  id: ThemeId;
  mode: ColorMode;
  /** German display name. */
  name: string;
  /** One German sentence for the theme picker. */
  description: string;
  colors: ThemeColors;
  type: Record<TextVariant, TextVariantStyle>;
  shape: ThemeShape;
  /** Keys of the font files this theme needs (see fonts.ts). Empty = system font only. */
  fonts: string[];
}

export interface ThemeFamily {
  id: ThemeId;
  name: string;
  description: string;
  light: Theme;
  dark: Theme;
}
