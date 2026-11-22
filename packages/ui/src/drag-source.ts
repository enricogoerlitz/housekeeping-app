// A drag source on iOS and Android (spec 0016, plan decision 2; the web has drag-source.web.ts).
// The raw touch events of the view drive the hold timer without taking the touch from the
// entry's Pressable or the page's ScrollView; only once the entry has lifted does a PanResponder
// claim the touch, and the page stops scrolling through the switch of the Screen.

import { useEffect, useState } from 'react';
import { PanResponder, type GestureResponderEvent, type NativeTouchEvent } from 'react-native';

import { accessibilityProps, type DragSourceBinding, type DragSourceOptions } from './drag-context';
import { useDragGesture } from './use-drag-gesture';

const now = () => Date.now();
const pointOf = (touch: NativeTouchEvent) => ({ x: touch.pageX, y: touch.pageY });
const touches = (event: GestureResponderEvent) => event.nativeEvent.changedTouches;

export function useDragSource(options: DragSourceOptions): DragSourceBinding {
  const gesture = useDragGesture(options, {
    onLift: (scroll) => scroll?.setScrollEnabled(false),
    onEnd: (scroll) => scroll?.setScrollEnabled(true),
  });
  const { dispatch, phase } = gesture;

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: () => phase() === 'dragging',
      onMoveShouldSetPanResponder: () => phase() === 'dragging',
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_event, state) => {
        // A second finger (a pinch) cancels.
        if (state.numberActiveTouches > 1) dispatch({ type: 'cancel' });
      },
      // Taken over anyway, e.g. by the system: the entry goes back.
      onPanResponderTerminate: () => dispatch({ type: 'cancel' }),
    }),
  );

  // Touches of a view that is gone are not delivered any more: a source that unmounts while
  // lifted ends its drag instead of leaving it hanging.
  useEffect(
    () => () => {
      if (phase() !== 'idle') dispatch({ type: 'cancel' });
    },
    [dispatch, phase],
  );

  return {
    ref: gesture.setNode,
    props: {
      ...responder.panHandlers,
      onTouchStart: (event) => {
        for (const touch of touches(event)) {
          dispatch({
            type: 'down',
            pointerId: Number(touch.identifier),
            kind: 'touch',
            point: pointOf(touch),
            time: now(),
          });
        }
      },
      onTouchMove: (event) => {
        for (const touch of touches(event)) {
          dispatch({
            type: 'move',
            pointerId: Number(touch.identifier),
            point: pointOf(touch),
            time: now(),
          });
        }
      },
      onTouchEnd: (event) => {
        for (const touch of touches(event)) {
          dispatch({
            type: 'up',
            pointerId: Number(touch.identifier),
            point: pointOf(touch),
            time: now(),
            target: null,
          });
        }
      },
      // The scroll view took the touch before the entry lifted: it scrolls, nothing lifts.
      onTouchCancel: () => dispatch({ type: 'cancel' }),
      ...accessibilityProps(options.accessibilityAction),
    },
    style: null,
    dragging: gesture.dragging,
    guardPress: gesture.guardPress,
  };
}
