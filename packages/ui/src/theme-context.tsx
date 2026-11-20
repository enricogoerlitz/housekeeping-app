import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

import { getTheme, type ColorMode, type Theme, type ThemeId } from './themes';

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
  const bp: Breakpoint = width < 700 ? 'phone' : width < 1100 ? 'tablet' : 'desktop';
  return { width, height, bp, isPhone: bp === 'phone', isWide: bp !== 'phone' };
}

/** Spacing scale in points. Use these instead of ad-hoc numbers. */
export const space = { xxs: 2, xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
