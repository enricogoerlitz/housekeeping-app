import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { PanResponder, View, type PanResponderGestureState } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon, Text } from './primitives';
import { useTheme } from './theme-context';

export interface SwipeToRemoveProps {
  children: ReactNode;
  /** Runs once the row was swiped far enough to the left. */
  onRemove: () => void;
  /** Text behind the row, e.g. "Entfernen". */
  label: string;
  /** False: no swipe (wider screens, offline); the row behaves like a plain row. */
  enabled?: boolean;
  testID?: string;
}

// A swipe starts only on a clearly horizontal move, so vertical scrolling keeps working.
const START_DISTANCE = 12;
// Removal past a third of the row or with a quick flick to the left.
const REMOVE_SHARE = 0.35;
const REMOVE_VELOCITY = 0.6;
const LEAVE_MS = 180;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const SPRING_BACK = { damping: 22, stiffness: 260 };
const COVER_MS = 250;

const isHorizontalLeft = (gesture: PanResponderGestureState) =>
  gesture.dx < -START_DISTANCE && Math.abs(gesture.dx) > 2 * Math.abs(gesture.dy);

/**
 * A list row that is removed by swiping it to the left (spec 0006, REQ-004): it follows the finger
 * 1:1, springs back when let go early and slides out past a third of its width. Behind it the
 * caller's label says what happens. Not the only way: the row's own window offers "Entfernen" too,
 * for screen readers and wider screens without swipe.
 */
export function SwipeToRemove(props: SwipeToRemoveProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const offset = useSharedValue(0);
  const width = useSharedValue(0);
  const [leaving, setLeaving] = useState(false);
  // While and just after a swipe a cover lies over the row, so letting go is never a tap on it.
  const [swiping, setSwiping] = useState(false);
  const remove = useEffectEvent(() => props.onRemove());

  // The handlers only move the row and say when it leaves; the effect below removes it.
  const [responder] = useState(() => {
    // Set on the first move: react-native-web does not report the grant of a captured gesture.
    let moving = false;
    const stop = () => {
      moving = false;
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) => isHorizontalLeft(gesture),
      onMoveShouldSetPanResponder: (_event, gesture) => isHorizontalLeft(gesture),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_event, gesture) => {
        if (!moving) {
          moving = true;
          setSwiping(true);
        }
        offset.set(Math.min(0, gesture.dx));
      },
      onPanResponderRelease: (_event, gesture) => {
        const far = width.get() > 0 && -gesture.dx > width.get() * REMOVE_SHARE;
        if (far || gesture.vx < -REMOVE_VELOCITY) setLeaving(true);
        else offset.set(withSpring(0, SPRING_BACK));
        stop();
        setTimeout(() => setSwiping(false), COVER_MS);
      },
      onPanResponderTerminate: () => {
        stop();
        offset.set(withSpring(0, SPRING_BACK));
        setSwiping(false);
      },
    });
  });

  useEffect(() => {
    if (!leaving) return;
    if (!reduced) {
      offset.set(
        withTiming(-width.get(), {
          duration: LEAVE_MS,
          easing: EASE_OUT,
          reduceMotion: ReduceMotion.Never,
        }),
      );
    }
    const timer = setTimeout(
      () => {
        remove();
        // Still here (e.g. the removal was refused): the row comes back.
        offset.set(0);
        setLeaving(false);
      },
      reduced ? 0 : LEAVE_MS,
    );
    return () => clearTimeout(timer);
  }, [leaving, reduced, offset, width]);
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));

  if (props.enabled === false) return <>{props.children}</>;
  return (
    <View
      testID={props.testID}
      onLayout={(event) => {
        width.set(event.nativeEvent.layout.width);
      }}
      style={{
        overflow: 'hidden',
        borderRadius: theme.shape.list === 'tile' ? theme.shape.radius.card - 4 : 0,
      }}
    >
      <View
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
          paddingHorizontal: 16,
          backgroundColor: theme.colors.surfaceSunken,
        }}
      >
        <Icon name="trash" size={18} color="muted" />
        <Text variant="smallStrong" color="muted">
          {props.label}
        </Text>
      </View>
      <Animated.View
        {...responder.panHandlers}
        style={[
          // The row must cover the label behind it; a tile brings its own surface.
          {
            backgroundColor:
              theme.shape.list === 'grouped' ? theme.colors.surface : theme.colors.bg,
          },
          rowStyle,
        ]}
      >
        {props.children}
      </Animated.View>
      {swiping ? (
        <View aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
      ) : null}
    </View>
  );
}
