import { useEffect, useRef } from 'react';
import { Keyboard, Platform, type GestureResponderEvent } from 'react-native';

import { dragDismissesKeyboard } from './drag-dismiss';

type Point = { x: number; y: number };

/**
 * While a chat is shown the page itself never bounces (composer polish 28.11.): on iPhone a drag
 * on a chat shorter than the screen pulled the whole page — header and input included — down with
 * the finger and let it spring back, the input out of sight for half a second. Only the chat's
 * own scrolling moves; the page's setting comes back when the chat goes.
 */
function useNoPageBounce() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const nodes = [document.documentElement, document.body];
    const before = nodes.map((node) => node.style.overscrollBehavior);
    for (const node of nodes) node.style.overscrollBehavior = 'none';
    return () => {
      nodes.forEach((node, index) => {
        node.style.overscrollBehavior = before[index] ?? '';
      });
    };
  }, []);
}

/**
 * Touch handlers for a chat's scrolling content (spec 0067): the first clear downward drag sends
 * the keyboard away, the page keeps scrolling with the finger.
 */
export function useDragDismissKeyboard(keyboardOpen: boolean): {
  onTouchStart: (event: GestureResponderEvent) => void;
  onTouchMove: (event: GestureResponderEvent) => void;
} {
  useNoPageBounce();
  const start = useRef<Point | undefined>(undefined);
  const point = (event: GestureResponderEvent): Point => ({
    x: event.nativeEvent.pageX,
    y: event.nativeEvent.pageY,
  });
  return {
    onTouchStart: (event) => {
      start.current = point(event);
    },
    onTouchMove: (event) => {
      if (!start.current) return;
      if (dragDismissesKeyboard(start.current, point(event), keyboardOpen)) {
        start.current = undefined;
        Keyboard.dismiss();
      }
    },
  };
}
