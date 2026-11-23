import { useEffect, useEffectEvent, useLayoutEffect, useState, type ReactNode } from 'react';
import { PanResponder, Platform } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useFinePointer } from './pointer';
import {
  claimsTabSwipe,
  scrollKeepsTabSwipe,
  tabSwipeOffset,
  tabSwipeStep,
  type TabSwipe,
} from './tab-swipe';
import { useBreakpoint } from './theme-context';

// Spec 0029, decision 7: the old content leaves in 180 ms, the new one arrives from 30 % of the
// width in 220 ms while fading in; a release short of the threshold springs back without overshoot.
const LEAVE_MS = 180;
const ARRIVE_MS = 220;
const ARRIVE_SHARE = 0.3;
const FADE_MS = 150;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const SETTLE = { duration: 300, dampingRatio: 1, reduceMotion: ReduceMotion.Never };
const TIMING = { easing: EASE_OUT, reduceMotion: ReduceMotion.Never };

// The content of the new tab may mount a fresh `Screen` (Essen swaps the whole page), so the
// direction it arrives from survives a remount here. Taken only right after a swipe.
let arriving: { step: -1 | 1; at: number } | undefined;
const ARRIVE_WITHIN_MS = 1000;

/** Web: a touch starting in an area that scrolls sideways belongs to that area (decision 8). */
function inSidewaysScroller(target: unknown): boolean {
  if (Platform.OS !== 'web') return false;
  const view = globalThis as unknown as {
    getComputedStyle?: (element: unknown) => { overflowX: string };
  };
  let node = target as { scrollWidth?: number; clientWidth?: number; parentElement?: unknown };
  while (node && typeof node.scrollWidth === 'number') {
    if (node.scrollWidth > (node.clientWidth ?? 0) + 1) {
      const overflow = view.getComputedStyle?.(node).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
    node = node.parentElement as typeof node;
  }
  return false;
}

/**
 * The page content below the view tabs on phones (spec 0029, REQ-003): it follows a sideways
 * finger, and a release past the threshold changes the tab like a tap would. Only with a finger;
 * inner gestures (swiping a row, dragging to reorder) claim the touch first, vertical scrolling
 * stays with the page.
 */
export function TabSwipeArea(props: { swipe: TabSwipe; children: ReactNode }) {
  const { isPhone, width: screenWidth } = useBreakpoint();
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const offset = useSharedValue(0);
  const opacity = useSharedValue(1);

  // The responder is created once and reads the latest values from these.
  const enabled = useSharedValue(false);
  const still = useSharedValue(reduced);
  const width = useSharedValue(screenWidth);
  const index = useSharedValue(props.swipe.index);
  const count = useSharedValue(props.swipe.count);
  const blocked = useSharedValue(false);
  // Where the finger went down, and how far it had come when the swipe took over: a swipe taken
  // after a native scroll counts from there (spec 0030, REQ-007).
  const start = useSharedValue({ x: 0, y: 0 });
  const base = useSharedValue(0);
  // idle: nothing yet · pending: holds the finger after a native scroll began, not decided ·
  // swiping: follows the finger · scrolling: the move is a scroll, nothing to do until release.
  const mode = useSharedValue<'idle' | 'pending' | 'swiping' | 'scrolling'>('idle');
  useLayoutEffect(() => {
    enabled.set(isPhone && !fine);
    still.set(reduced);
    index.set(props.swipe.index);
    count.set(props.swipe.count);
  }, [isPhone, fine, reduced, props.swipe.index, props.swipe.count, enabled, still, index, count]);

  // A new tab arrives from the side the finger pushed towards; reduced motion only fades.
  const shown = props.swipe.index;
  const arrive = useEffectEvent(() => {
    const pending = arriving;
    arriving = undefined;
    if (!pending || Date.now() - pending.at > ARRIVE_WITHIN_MS) {
      offset.set(0);
      opacity.set(1);
      return;
    }
    if (reduced) {
      offset.set(0);
      opacity.set(0);
      opacity.set(withTiming(1, { ...TIMING, duration: FADE_MS }));
      return;
    }
    offset.set(pending.step * width.get() * ARRIVE_SHARE);
    opacity.set(0);
    offset.set(withTiming(0, { ...TIMING, duration: ARRIVE_MS }));
    opacity.set(withTiming(1, { ...TIMING, duration: ARRIVE_MS }));
  });
  useLayoutEffect(() => {
    arrive();
  }, [shown]);

  // A finished swipe reaches the screen through this state, like a tap on the tab.
  const [swiped, setSwiped] = useState<{ step: -1 | 1; count: number }>();
  const step = useEffectEvent((direction: -1 | 1) => {
    // The content left towards the finger, so the new tab arrives from the other side.
    arriving = { step: direction, at: Date.now() };
    props.swipe.onStep(direction);
  });
  useEffect(() => {
    if (!swiped) return;
    const before = index.get();
    step(swiped.step);
    // The tab did not change after all (e.g. the address was not taken): bring the content back.
    const timer = setTimeout(() => {
      if (index.get() !== before) return;
      arriving = undefined;
      offset.set(withSpring(0, SETTLE));
      opacity.set(withTiming(1, { ...TIMING, duration: FADE_MS }));
    }, ARRIVE_WITHIN_MS);
    return () => clearTimeout(timer);
  }, [swiped, index, offset, opacity]);

  const [responder] = useState(() => {
    const report = (direction: -1 | 1) =>
      setSwiped((previous) => ({ step: direction, count: (previous?.count ?? 0) + 1 }));
    const settle = () => offset.set(withSpring(0, SETTLE));
    const take = (dx: number) => {
      mode.set('swiping');
      base.set(dx);
      cancelAnimation(offset);
      cancelAnimation(opacity);
      opacity.set(1);
    };
    const pan = PanResponder.create({
      onStartShouldSetPanResponderCapture: (event) => {
        blocked.set(inSidewaysScroller(event.nativeEvent.target));
        start.set({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
        mode.set('idle');
        return false;
      },
      // Every move on its way down: a move that runs mostly vertically first stays a scroll, even
      // when it turns sideways later (AC-025). Never takes the finger here.
      onMoveShouldSetPanResponderCapture: (_event, gesture) => {
        if (mode.get() === 'idle' && !scrollKeepsTabSwipe(gesture, width.get())) {
          mode.set('scrolling');
        }
        return false;
      },
      // Bubbling only: a row swipe or a reorder drag inside claims the move first.
      onMoveShouldSetPanResponder: (_event, gesture) =>
        enabled.get() &&
        !blocked.get() &&
        mode.get() === 'idle' &&
        claimsTabSwipe(gesture, width.get()),
      // Spec 0030, REQ-007: once the swipe has the finger, or holds it after a native scroll
      // began, a scroll view does not take it back; a move that turned out a scroll may go.
      onPanResponderTerminationRequest: () => mode.get() === 'scrolling',
      onPanResponderReject: () => mode.set('idle'),
      onPanResponderGrant: () => {
        // Taken through a native scroll: undecided until the move tells (see `scrollClaim`).
        if (mode.get() === 'pending') return;
        take(0);
      },
      onPanResponderMove: (_event, gesture) => {
        if (mode.get() === 'pending') {
          const from = start.get();
          const move = {
            dx: gesture.moveX - from.x,
            dy: gesture.moveY - from.y,
            moveX: gesture.moveX,
          };
          if (claimsTabSwipe(move, width.get())) take(gesture.dx);
          else if (!scrollKeepsTabSwipe(move, width.get())) mode.set('scrolling');
        }
        if (mode.get() !== 'swiping' || still.get()) return;
        offset.set(
          tabSwipeOffset(gesture.dx - base.get(), { index: index.get(), count: count.get() }),
        );
      },
      onPanResponderRelease: (_event, gesture) => {
        if (mode.get() !== 'swiping') {
          mode.set('idle');
          return;
        }
        mode.set('idle');
        const areaWidth = width.get();
        const direction = tabSwipeStep(gesture.dx - base.get(), gesture.vx, {
          index: index.get(),
          count: count.get(),
          width: areaWidth,
        });
        if (direction === 0) {
          settle();
          return;
        }
        if (still.get()) {
          report(direction);
          return;
        }
        offset.set(
          withTiming(-direction * areaWidth, { ...TIMING, duration: LEAVE_MS }, (finished) => {
            if (finished) scheduleOnRN(report, direction);
          }),
        );
      },
      onPanResponderTerminate: () => {
        mode.set('idle');
        settle();
      },
    });
    // Web: a native scroll that starts while the finger is down would make the ScrollView the
    // responder for good. The swipe area, its ancestor, takes it in the capture phase instead
    // while the move may still become a swipe; the page keeps scrolling natively either way.
    const scrollClaim = {
      onScrollShouldSetResponderCapture: () => {
        if (!enabled.get() || blocked.get() || mode.get() !== 'idle') return false;
        mode.set('pending');
        return true;
      },
    };
    return { ...pan.panHandlers, ...(Platform.OS === 'web' ? scrollClaim : {}) };
  });

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: offset.get() }],
  }));
  return (
    <Animated.View
      {...responder}
      onLayout={(event) => width.set(Math.round(event.nativeEvent.layout.width) || screenWidth)}
      style={[{ flex: 1 }, style]}
    >
      {props.children}
    </Animated.View>
  );
}
