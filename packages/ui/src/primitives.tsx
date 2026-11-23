import { useContext, type ReactNode } from 'react';
import {
  Platform,
  Text as RNText,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { icons, type IconName } from './icons';
import { ToneContext, useTheme } from './theme-context';
import type { TextVariant, Theme } from './themes';

export type ColorToken =
  'text' | 'muted' | 'accent' | 'onAccent' | 'success' | 'onSuccess' | 'warn' | 'star' | 'due';

/** Resolves a colour token, honouring the text colour inherited from a tone tile. */
export function useColor(token: ColorToken | undefined, fallback: ColorToken = 'text'): string {
  const theme = useTheme();
  const tone = useContext(ToneContext);
  return resolveColor(theme, tone?.fg, token ?? fallback);
}

function resolveColor(theme: Theme, toneFg: string | undefined, token: ColorToken): string {
  const c = theme.colors;
  switch (token) {
    case 'text':
      return toneFg ?? c.text;
    case 'muted':
      // On a tone tile the tile's own foreground is the readable secondary colour; grey would wash out.
      return toneFg ?? c.textMuted;
    case 'accent':
      return toneFg ?? c.accent;
    case 'onAccent':
      return c.onAccent;
    case 'success':
      return c.success;
    case 'onSuccess':
      return c.onSuccess;
    case 'warn':
      return c.warnText;
    case 'star':
      return c.star;
    case 'due':
      return c.due;
  }
}

/**
 * Long German words break at a syllable with a hyphen instead of anywhere (spec 0031, REQ-033);
 * the browser hyphenates by `lang="de"`. Native apps break words themselves.
 */
export const HYPHENATE: TextStyle | null =
  Platform.OS === 'web' ? ({ hyphens: 'auto' } as unknown as TextStyle) : null;

/** The title roles hyphenate (REQ-033). */
const HYPHENATED_VARIANTS = new Set<TextVariant>(['caption', 'rowTitle', 'cardTitle']);

export interface TextProps {
  children?: ReactNode;
  variant?: TextVariant;
  color?: ColorToken;
  align?: 'left' | 'center' | 'right';
  numberOfLines?: number;
  strike?: boolean;
  style?: StyleProp<TextStyle>;
  testID?: string;
  /** Marks the text as a heading for screen readers. */
  heading?: boolean;
  selectable?: boolean;
}

export function Text(props: TextProps) {
  const theme = useTheme();
  const color = useColor(props.color);
  const variant = theme.type[props.variant ?? 'body'];
  return (
    <RNText
      testID={props.testID}
      numberOfLines={props.numberOfLines}
      selectable={props.selectable}
      accessibilityRole={props.heading ? 'header' : undefined}
      style={[
        variant,
        HYPHENATED_VARIANTS.has(props.variant ?? 'body') ? HYPHENATE : null,
        { color },
        props.align ? { textAlign: props.align } : null,
        props.strike ? { textDecorationLine: 'line-through' } : null,
        props.style,
      ]}
    >
      {props.children}
    </RNText>
  );
}

export interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorToken;
  /** Fills the shape with the stroke colour (used for rating stars). */
  filled?: boolean;
  testID?: string;
}

export function Icon(props: IconProps) {
  const theme = useTheme();
  const color = useColor(props.color);
  const Glyph = icons[props.name];
  return (
    <Glyph
      testID={props.testID}
      size={props.size ?? 22}
      color={color}
      strokeWidth={theme.shape.stroke}
      fill={props.filled ? color : 'none'}
    />
  );
}

export interface SurfaceProps {
  children?: ReactNode;
  /** Inner padding in points; default 14. Pass 0 for edge-to-edge content. */
  padding?: number;
  radius?: number;
  sunken?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A card on the page background. Resets inherited tone colours, so text on it uses the normal
 * text colours again even inside a coloured tile.
 */
export function Surface(props: SurfaceProps) {
  const theme = useTheme();
  return (
    <ToneContext.Provider value={undefined}>
      <View
        testID={props.testID}
        style={[
          {
            backgroundColor: props.sunken ? theme.colors.surfaceSunken : theme.colors.surface,
            borderRadius: props.radius ?? theme.shape.radius.card,
            padding: props.padding ?? 14,
          },
          theme.shape.cardBorder && !props.sunken
            ? { borderWidth: 1, borderColor: theme.colors.border }
            : null,
          props.style,
        ]}
      >
        {props.children}
      </View>
    </ToneContext.Provider>
  );
}

export function Divider(props: { inset?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: props.inset ?? 0 }}
    />
  );
}

/** Horizontal layout helper. */
export function Row(props: {
  children?: ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: props.align ?? 'center',
          justifyContent: props.justify,
          gap: props.gap ?? 8,
          flexWrap: props.wrap ? 'wrap' : 'nowrap',
        },
        props.style,
      ]}
    >
      {props.children}
    </View>
  );
}

/** Vertical layout helper. */
export function Stack(props: { children?: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap: props.gap ?? 8 }, props.style]}>{props.children}</View>;
}
