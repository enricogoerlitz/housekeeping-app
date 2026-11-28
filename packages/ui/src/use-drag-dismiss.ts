import { useRef } from 'react';
import { Keyboard, type GestureResponderEvent } from 'react-native';

import { dragDismissesKeyboard } from './drag-dismiss';

type Point = { x: number; y: number };

/**
 * Touch handlers for a chat's scrolling content (spec 0067): the first clear downward drag sends
 * the keyboard away, the page keeps scrolling with the finger.
 */
export function useDragDismissKeyboard(keyboardOpen: boolean): {
  onTouchStart: (event: GestureResponderEvent) => void;
  onTouchMove: (event: GestureResponderEvent) => void;
} {
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
