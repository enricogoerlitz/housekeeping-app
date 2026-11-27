import { useContext, useState, type ReactNode, type Ref } from 'react';
import {
  Platform,
  Text as RNText,
  View,
  type HostInstance,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { icons, type IconName } from './icons';
import { ToneContext, useTheme } from './theme-context';
import type { TextVariant, Theme } from './themes';
import { hyphenHang, wordOverflows } from './title-fit';

export type ColorToken =
  | 'text'
  | 'muted'
  | 'accent'
  | 'onAccent'
  | 'success'
  | 'onSuccess'
  | 'warn'
  | 'star'
  | 'due'
  /** An old value or a removed row in the Änderungsansicht (spec 0049). */
  | 'removed';

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
    case 'removed':
      return c.removedText;
    case 'star':
      return c.star;
    case 'due':
      return c.due;
  }
}

/**
 * Titles break between words and at real hyphens only, never by the browser's automatic
 * hyphenation: "Halloumi-|Pfanne", not "Halloumi-Pfan-|ne" (spec 0057, REQ-004; replaces the
 * automatic hyphenation of spec 0031, REQ-033). Native apps break words themselves.
 */
export const TITLE_BREAK: TextStyle | null =
  Platform.OS === 'web' ? ({ hyphens: 'manual' } as unknown as TextStyle) : null;

/** The title roles (REQ-004). */
const TITLE_VARIANTS = new Set<TextVariant>(['caption', 'rowTitle', 'cardTitle']);

/** A word may overflow, so `wholeWords` can tell (web only). */
const KEEP_WORDS: TextStyle | null =
  Platform.OS === 'web'
    ? ({ overflowWrap: 'normal', wordWrap: 'normal' } as unknown as TextStyle)
    : null;

export interface TextProps {
  /** The text's element, e.g. to tell whether it is cut off (spec 0035, Tooltip). */
  ref?: Ref<HostInstance>;
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
  /**
   * For narrow cards (spec 0057, REQ-004): words are never cut inside; when one is wider than the
   * line, the title goes to one line ending in "…". Web only; native apps break words themselves.
   */
  wholeWords?: boolean;
  /**
   * With `wholeWords`, for narrow columns (review 0004, N-18): a hyphen at a line's end may stand
   * a little past the line, so "Kichererbsen-|Eintopf" breaks after its hyphen and never right
   * before it; only a word wider than that cuts the title.
   */
  hangingHyphens?: boolean;
}

export function Text({ ref, ...props }: TextProps) {
  const theme = useTheme();
  const color = useColor(props.color);
  const variant = theme.type[props.variant ?? 'body'];
  const hang = props.hangingHyphens ? hyphenHang(variant.fontSize ?? 16) : 0;
  const fit = useWholeWords(props.wholeWords === true, props.children, hang + 1);
  // The line keeps its width; the padding is the hyphen's room, the overflow clip leaves it seen.
  const hanging = fit && !fit.cut && hang > 0 ? { paddingRight: hang, marginRight: -hang } : null;
  return (
    <RNText
      ref={ref}
      testID={props.testID}
      numberOfLines={fit?.cut ? 1 : props.numberOfLines}
      selectable={props.selectable}
      accessibilityRole={props.heading ? 'header' : undefined}
      onLayout={fit?.onLayout}
      style={[
        variant,
        TITLE_VARIANTS.has(props.variant ?? 'body') ? TITLE_BREAK : null,
        fit && !fit.cut ? KEEP_WORDS : null,
        hanging,
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

/**
 * `wholeWords`: after each layout the text tells whether a word overflows its box; then it is cut
 * to one line until its width or its text changes, so the answer never flips back and forth.
 */
function useWholeWords(
  enabled: boolean,
  children: ReactNode,
  slack: number,
): { cut: boolean; onLayout: (event: LayoutChangeEvent) => void } | undefined {
  const [cutAt, setCutAt] = useState<{ text: string; width: number }>();
  if (!enabled || Platform.OS !== 'web') return undefined;
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : '';
  const cut = cutAt !== undefined && cutAt.text === text;
  return {
    cut,
    onLayout: (event) => {
      const width = event.nativeEvent.layout.width;
      if (cut) {
        if (width !== cutAt.width) setCutAt(undefined);
        return;
      }
      // On the web the layout event carries the text's element.
      const node = (event.nativeEvent as { target?: unknown }).target;
      if (wordOverflows(node as { scrollWidth?: number; clientWidth?: number } | null, slack))
        setCutAt({ text, width });
    },
  };
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
