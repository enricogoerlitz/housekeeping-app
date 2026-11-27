import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { FOCUS_RING_ROOM } from './controls';
import { revealOffset, scrollFade, scrollFadeMask, ScrollRowRevealContext } from './scroll-fade';

export interface ScrollRowProps {
  children?: ReactNode;
  gap?: number;
  /** Extra style of the content row, e.g. its own side padding. */
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A row of chips or tiles that scrolls sideways. It leaves room for the focus ring on all four
 * sides, also around the first and the last item, without moving the row (spec 0019, AC-005). On
 * the web it fades out at an edge where more follows, so the item there is not cut hard; a chip
 * chosen there scrolls in whole (iN-08, review 0004).
 */
export function ScrollRow(props: ScrollRowProps) {
  const [row, setRow] = useState({ offset: 0, content: 0, view: 0 });
  const mask = Platform.OS === 'web' ? scrollFadeMask(scrollFade(row)) : undefined;
  const scroller = useRef<ScrollViewInstance>(null);
  const reduced = useReducedMotion();
  // On the web the ScrollView's ref is its element; the chip hands over its own.
  const reveal = useCallback(
    (item: unknown) => {
      const node = scroller.current as unknown;
      if (typeof HTMLElement === 'undefined') return;
      if (!(node instanceof HTMLElement) || !(item instanceof HTMLElement)) return;
      const left = node.getBoundingClientRect().left - node.scrollLeft;
      const box = item.getBoundingClientRect();
      const next = revealOffset(
        { offset: node.scrollLeft, content: node.scrollWidth, view: node.clientWidth },
        { start: box.left - left, end: box.right - left },
      );
      if (next !== undefined)
        node.scrollTo?.({ left: next, behavior: reduced ? 'auto' : 'smooth' });
    },
    [reduced],
  );
  return (
    <ScrollRowRevealContext.Provider value={Platform.OS === 'web' ? reveal : undefined}>
      <ScrollView
        ref={scroller}
        testID={props.testID}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onLayout={(event) => {
          const view = event.nativeEvent.layout.width;
          setRow((current) => (current.view === view ? current : { ...current, view }));
        }}
        onContentSizeChange={(content) =>
          setRow((current) => (current.content === content ? current : { ...current, content }))
        }
        onScroll={(event) => {
          const offset = event.nativeEvent.contentOffset.x;
          setRow((current) => (current.offset === offset ? current : { ...current, offset }));
        }}
        style={[
          { flexGrow: 0, margin: -FOCUS_RING_ROOM },
          mask ? ({ maskImage: mask, WebkitMaskImage: mask } as unknown as ViewStyle) : null,
        ]}
        contentContainerStyle={[
          { gap: props.gap ?? 8, alignItems: 'center', padding: FOCUS_RING_ROOM },
          props.contentStyle,
        ]}
      >
        {props.children}
      </ScrollView>
    </ScrollRowRevealContext.Provider>
  );
}
