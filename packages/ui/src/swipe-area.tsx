import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { claimsSwipe, swipeStep } from './swipe-step';

export interface SwipeAreaProps {
  /** +1 after a swipe to the left (next), -1 to the right (previous). */
  onSwipe: (step: 1 | -1) => void;
  /** false while something else owns the finger, e.g. a drag out of the area. */
  enabled?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// Vertical moves stay with the browser (scrolling); sideways ones reach the responder.
const WEB_PAN_Y: ViewStyle | null =
  Platform.OS === 'web' ? ({ touchAction: 'pan-y' } as unknown as ViewStyle) : null;

/**
 * An area that changes to the next or previous item on a sideways swipe, e.g. the day in the day
 * window (spec 0016, REQ-006). Taps on its children and vertical scrolling keep working; the swipe
 * only takes over once the finger runs clearly sideways. A swipe is a shortcut: offer the same
 * change as buttons, too.
 */
export function SwipeArea(props: SwipeAreaProps) {
  const live = useRef(props);
  useLayoutEffect(() => {
    live.current = props;
  });
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        live.current.enabled !== false && claimsSwipe(gesture.dx, gesture.dy),
      onPanResponderRelease: (_event, gesture) => {
        const step = swipeStep(gesture.dx, gesture.vx);
        if (step !== 0) live.current.onSwipe(step);
      },
    }),
  );
  return (
    <View {...responder.panHandlers} testID={props.testID} style={[WEB_PAN_Y, props.style]}>
      {props.children}
    </View>
  );
}
