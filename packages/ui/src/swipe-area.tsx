import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { PanResponder, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { inSidewaysScroller } from './sideways-scroller';
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
  const enabled = useSharedValue(props.enabled !== false);
  useEffect(() => {
    enabled.set(props.enabled !== false);
  }, [props.enabled, enabled]);

  // The handlers are created once; a finished swipe reaches the caller through this state.
  const [swiped, setSwiped] = useState<{ step: 1 | -1; count: number }>();
  const report = useEffectEvent((step: 1 | -1) => props.onSwipe(step));
  useEffect(() => {
    if (swiped) report(swiped.step);
  }, [swiped]);

  // A touch in a row that scrolls sideways belongs to that row (spec 0034, AC-012).
  const blocked = useSharedValue(false);
  const [responder] = useState(() => {
    const claims = (dx: number, dy: number) =>
      enabled.get() && !blocked.get() && claimsSwipe(dx, dy);
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: (event) => {
        blocked.set(inSidewaysScroller(event.nativeEvent.target));
        return false;
      },
      onMoveShouldSetPanResponderCapture: (_event, gesture) => claims(gesture.dx, gesture.dy),
      onMoveShouldSetPanResponder: (_event, gesture) => claims(gesture.dx, gesture.dy),
      // Once sideways, the swipe is this area's: a swipe around it (the view tabs) never takes it
      // over (spec 0034, AC-014).
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_event, gesture) => {
        const step = swipeStep(gesture.dx, gesture.vx);
        if (step !== 0) {
          setSwiped((previous) => ({ step, count: (previous?.count ?? 0) + 1 }));
        }
      },
    });
  });
  return (
    <View {...responder.panHandlers} testID={props.testID} style={[WEB_PAN_Y, props.style]}>
      {props.children}
    </View>
  );
}
