import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Platform, useWindowDimensions, type ViewStyle } from 'react-native';

import { PHONE_MAX_WIDTH } from './sheet-size';
import { getTheme, type ColorMode, type Theme, type ThemeId, type Tone } from './themes';

const ThemeContext = createContext<Theme>(getTheme('markthalle', 'light'));

export function ThemeProvider(props: { themeId: ThemeId; mode: ColorMode; children: ReactNode }) {
  const theme = useMemo(() => getTheme(props.themeId, props.mode), [props.themeId, props.mode]);
  return <ThemeContext.Provider value={theme}>{props.children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Text colours inherited from a coloured surface (a tone tile in the theme "Frisch").
 * Undefined = use the theme's normal text colours.
 */
export interface ToneColors {
  fg: string;
}
export const ToneContext = createContext<ToneColors | undefined>(undefined);

/** The area the current screen belongs to (spec 0005, D4). Set by `Screen`'s `tone`. */
export const AreaToneContext = createContext<Tone | undefined>(undefined);

/**
 * Colours of the screen's area when the theme paints areas ("Frisch"): `fill` and `onFill` for the
 * primary action, `line` under the active view tab. Light mode fills with the soft shade, dark mode
 * with the strong one, so the button stands out from the page either way. Undefined = accent.
 */
export function useAreaColors(): { fill: string; onFill: string; line: string } | undefined {
  const theme = useTheme();
  const tone = useContext(AreaToneContext);
  if (!theme.shape.areaTone || !tone) return undefined;
  const { bg, fg } = theme.colors.tones[tone];
  return theme.mode === 'dark'
    ? { fill: fg, onFill: bg, line: fg }
    : { fill: bg, onFill: fg, line: fg };
}

/**
 * The fill of a page: `bg`, and on the web a theme's sky over it (spec 0058, REQ-003). The sky
 * has the size of the window and hangs from its top, so a view lying over the page (the header on
 * phones) shows exactly the piece behind it; `top` = where the view starts below the page's top.
 */
export function pageFill(theme: Theme, height: number, top = 0): ViewStyle {
  const fill: ViewStyle = { backgroundColor: theme.colors.bg };
  if (theme.backdrop === undefined || Platform.OS !== 'web') return fill;
  return {
    ...fill,
    backgroundImage: theme.backdrop,
    backgroundSize: `100% ${height}px`,
    backgroundPosition: `0px ${-top}px`,
    backgroundRepeat: 'no-repeat',
  };
}

/** The corners of an icon bubble (spec 0058, REQ-004); undefined when the theme draws circles. */
export function bubbleCorners(theme: Theme): ViewStyle | undefined {
  const bubble = theme.shape.bubble;
  if (!bubble) return undefined;
  return {
    borderTopLeftRadius: bubble.topLeft,
    borderTopRightRadius: bubble.topRight,
    borderBottomRightRadius: bubble.bottomRight,
    borderBottomLeftRadius: bubble.bottomLeft,
  };
}

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

/** Layout decisions come from the window width, never from the platform. */
export function useBreakpoint(): {
  width: number;
  height: number;
  bp: Breakpoint;
  isPhone: boolean;
  isWide: boolean;
} {
  const { width, height } = useWindowDimensions();
  const bp: Breakpoint = width < PHONE_MAX_WIDTH ? 'phone' : width < 1100 ? 'tablet' : 'desktop';
  return { width, height, bp, isPhone: bp === 'phone', isWide: bp !== 'phone' };
}

/** Spacing scale in points. Use these instead of ad-hoc numbers. */
export const space = { xxs: 2, xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
