import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Platform, View, type HostInstance } from 'react-native';

import { useFinePointer } from './pointer';
import { Text } from './primitives';
import { useTheme } from './theme-context';
import { TopLayer } from './top-layer';
import { isTruncated, tooltipPosition, type Rect } from './tooltip-position';

/** How long the mouse rests on a cut off text before its tooltip shows (spec 0035, AC-011). */
export const TOOLTIP_DELAY = 500;

/** The widest a tooltip gets before its text wraps. */
const MAX_WIDTH = 320;

interface Measurable {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number };
}

export interface Tooltip {
  /** On the text that may be cut off. */
  onTarget: ((node: HostInstance | null) => void) | undefined;
  /** On the element the mouse rests on. Empty with a finger and on native (AC-013). */
  hoverProps: {
    onPointerEnter?: () => void;
    onPointerLeave?: () => void;
    onPointerDown?: () => void;
  };
  /** Rendered anywhere beside the element; it stands in the top layer. */
  tooltip: ReactNode;
  hide: () => void;
}

/**
 * A designed tooltip instead of the browser's (spec 0035, REQ-005): with a mouse or a trackpad,
 * when the pointer rests `TOOLTIP_DELAY` ms on an element whose text is cut off, `text` shows in a
 * small raised box above it (below it at the window's top). Leaving or pressing hides it. Never
 * with a finger, never on native: there the line opens with a tap.
 */
export function useTooltip(text: string | undefined, testID?: string): Tooltip {
  const fine = useFinePointer();
  const enabled = fine && Platform.OS === 'web' && text !== undefined;
  // State, not refs: the hook's handlers and node are read while rendering the line.
  const [target, setTargetNode] = useState<Measurable | null>(null);
  const [resting, setResting] = useState(false);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const hide = useCallback(() => {
    setResting(false);
    setAnchor(null);
  }, []);
  const rest = useCallback(() => setResting(true), []);
  const onTarget = useCallback((node: HostInstance | null) => {
    setTargetNode(node as unknown as Measurable | null);
  }, []);
  useEffect(() => {
    if (!enabled || !resting || !target) return;
    const timer = setTimeout(() => {
      if (!isTruncated(target)) return;
      const box = target.getBoundingClientRect();
      setAnchor({ x: box.left, y: box.top, width: box.width, height: box.height });
    }, TOOLTIP_DELAY);
    return () => clearTimeout(timer);
  }, [enabled, resting, target]);
  return {
    // Without a mouse nothing is measured, so the line renders once as before.
    onTarget: enabled ? onTarget : undefined,
    hoverProps: enabled ? { onPointerEnter: rest, onPointerLeave: hide, onPointerDown: hide } : {},
    hide,
    tooltip:
      enabled && anchor ? (
        <TooltipBox
          text={text}
          anchor={anchor}
          testID={testID === undefined ? undefined : `${testID}-tooltip`}
        />
      ) : null,
  };
}

function TooltipBox(props: { text: string; anchor: Rect; testID?: string }) {
  const theme = useTheme();
  const c = theme.colors;
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const { anchor } = props;
  // Measured once it is in the page, then moved to its place (above, or below at the top).
  const measure = useCallback(
    (node: HostInstance | null) => {
      const size = (node as unknown as Measurable | null)?.getBoundingClientRect();
      if (!size) return;
      setPlace(
        tooltipPosition(
          anchor,
          { width: size.width, height: size.height },
          { width: globalThis.innerWidth ?? 0, height: globalThis.innerHeight ?? 0 },
        ),
      );
    },
    [anchor],
  );
  return (
    <TopLayer>
      <View
        ref={measure}
        role="tooltip"
        pointerEvents="none"
        testID={props.testID}
        style={{
          // `fixed` is web only; the tooltip exists only there.
          position: 'fixed' as 'absolute',
          // Measured first at the window's corner, at its natural width, then shown at its place.
          left: place?.left ?? 0,
          top: place?.top ?? 0,
          opacity: place ? 1 : 0,
          zIndex: 1000,
          maxWidth: MAX_WIDTH,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: theme.shape.radius.control,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.surfaceRaised,
          boxShadow: c.shadowRaised,
        }}
      >
        <Text variant="small">{props.text}</Text>
      </View>
    </TopLayer>
  );
}
