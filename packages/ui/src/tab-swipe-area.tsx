import {
  startTransition,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import { PanResponder, Platform, View } from 'react-native';
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
import { inSidewaysScroller } from './sideways-scroller';
import {
  claimsTabSwipe,
  scrollKeepsTabSwipe,
  tabSwipeOffset,
  tabSwipePreviewStep,
  tabSwipeSettle,
  tabSwipeStep,
  type TabSwipe,
} from './tab-swipe';
import { TabPreviewContext, type TabPreviewFrame } from './tab-preview';
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
// Spec 0034, REQ-007: with the neighbour beside it the content goes on from where the finger let
// go, with its speed, and stops at the edge without overshoot.
const CARRY = { ...SETTLE, overshootClamping: true };
const NO_FRAME: TabPreviewFrame = { top: 0, inset: 0 };

type Side = 'prev' | 'next';
const sideOf = (step: -1 | 1): Side => (step === 1 ? 'next' : 'prev');

// The content of the new tab may mount a fresh `Screen` (Essen swaps the whole page), so the
// direction it arrives from survives a remount here. Taken only right after a swipe.
// `previewed`: the new tab already stood beside the content, so it arrives without a slide.
let arriving: { step: -1 | 1; at: number; previewed: boolean; chrome?: ScreenChrome } | undefined;

/** The measured header, tabs and toolbar of a phone's Screen. */
export interface ScreenChrome {
  expanded?: number;
  narrow?: number;
  toolbar: number;
}

/**
 * The chrome of the page a swipe with the neighbour beside it just left (spec 0034, REQ-007).
 * A page that mounts anew for the new tab (Essen) starts with it instead of one empty frame
 * before its header is measured.
 */
export function arrivingChrome(): ScreenChrome | undefined {
  if (!arriving?.previewed || Date.now() - arriving.at > ARRIVE_WITHIN_MS) return undefined;
  return arriving.chrome;
}
const ARRIVE_WITHIN_MS = 1000;

/**
 * The page content below the view tabs on phones (spec 0029, REQ-003): it follows a sideways
 * finger, and a release past the threshold changes the tab like a tap would. Only with a finger;
 * inner gestures (swiping a row, dragging to reorder) claim the touch first, vertical scrolling
 * stays with the page. With `swipe.preview` the neighbour tab stands beside the content while the
 * finger moves it (spec 0034, REQ-007), drawn once the swipe takes the finger.
 */
export function TabSwipeArea(props: {
  swipe: TabSwipe;
  /** Where the page's content starts, for the neighbour drawn beside it. */
  frame?: TabPreviewFrame;
  /** The page's measured chrome, handed to a page that mounts anew for the new tab. */
  chrome?: ScreenChrome;
  children: ReactNode;
}) {
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

  // The neighbour tabs drawn beside the content during this swipe, and the latest way to draw them.
  const [panes, setPanes] = useState<Partial<Record<Side, ReactNode>>>({});
  const [paneWidth, setPaneWidth] = useState(screenWidth);
  const [panesApi] = useState(() => {
    const drawn = new Set<Side>();
    let draw: TabSwipe['preview'];
    return {
      /** The latest way to draw a neighbour, from the screen's current render. */
      setDraw: (next: TabSwipe['preview']) => {
        draw = next;
      },
      drawn: (step: -1 | 1) => drawn.has(sideOf(step)),
      reveal: (step: -1 | 1) => {
        const side = sideOf(step);
        if (!draw || drawn.has(side)) return;
        drawn.add(side);
        const pane = draw(step);
        // Drawing a whole page takes a moment; the content follows the finger meanwhile.
        startTransition(() => setPanes((current) => ({ ...current, [side]: pane })));
      },
      clear: () => {
        drawn.clear();
        setPanes((current) => (Object.keys(current).length ? {} : current));
      },
    };
  });
  useLayoutEffect(() => panesApi.setDraw(props.swipe.preview));
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
    if (!pending || Date.now() - pending.at > ARRIVE_WITHIN_MS || pending.previewed) {
      offset.set(0);
      opacity.set(1);
      // One frame later: until the content stands at 0 again the picture beside it still covers
      // the room, so the change never shows an empty frame.
      const frame = requestAnimationFrame(panesApi.clear);
      return () => cancelAnimationFrame(frame);
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
  useLayoutEffect(() => arrive(), [shown]);

  // A finished swipe reaches the screen through this state, like a tap on the tab.
  const [swiped, setSwiped] = useState<{ step: -1 | 1; count: number }>();
  const step = useEffectEvent((direction: -1 | 1) => {
    // The content left towards the finger, so the new tab arrives from the other side.
    arriving = {
      step: direction,
      at: Date.now(),
      previewed: panesApi.drawn(direction),
      chrome: props.chrome,
    };
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
      offset.set(
        withSpring(0, SETTLE, (finished) => {
          if (finished) scheduleOnRN(panesApi.clear);
        }),
      );
      opacity.set(withTiming(1, { ...TIMING, duration: FADE_MS }));
    }, ARRIVE_WITHIN_MS);
    return () => clearTimeout(timer);
  }, [swiped, index, offset, opacity, panesApi]);

  const [responder] = useState(() => {
    const report = (direction: -1 | 1) =>
      setSwiped((previous) => ({ step: direction, count: (previous?.count ?? 0) + 1 }));
    // Back to the tab; the neighbour beside it goes once the content stands still.
    const settle = (velocity = 0) =>
      offset.set(
        withSpring(0, { ...SETTLE, velocity }, (finished) => {
          if (finished) scheduleOnRN(panesApi.clear);
        }),
      );
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
        const position = { index: index.get(), count: count.get() };
        const next = tabSwipeOffset(gesture.dx - base.get(), position);
        offset.set(next);
        const side = tabSwipePreviewStep(next, position);
        if (side !== undefined) panesApi.reveal(side);
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
        // PanResponder measures in pt/ms, Reanimated in pt/s.
        const velocity = gesture.vx * 1000;
        if (direction === 0) {
          settle(velocity);
          return;
        }
        if (still.get()) {
          report(direction);
          return;
        }
        if (panesApi.drawn(direction)) {
          offset.set(
            withSpring(tabSwipeSettle(direction, areaWidth), { ...CARRY, velocity }, (finished) => {
              if (finished) scheduleOnRN(report, direction);
            }),
          );
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
  const frame = props.frame ?? NO_FRAME;
  const pane = (side: Side) => {
    const node = panes[side];
    if (node === undefined) return null;
    return (
      <View
        testID={`tab-swipe-preview-${side}`}
        pointerEvents="none"
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: (side === 'next' ? 1 : -1) * paneWidth,
          width: paneWidth,
        }}
      >
        <TabPreviewContext.Provider value={frame}>{node}</TabPreviewContext.Provider>
      </View>
    );
  };
  const showing = panes.prev !== undefined || panes.next !== undefined;
  return (
    // While a neighbour stands beside the content, nothing past the area's edges shows.
    <View style={{ flex: 1, overflow: showing ? 'hidden' : undefined }}>
      <Animated.View
        {...responder}
        onLayout={(event) => {
          const measured = Math.round(event.nativeEvent.layout.width) || screenWidth;
          width.set(measured);
          setPaneWidth(measured);
        }}
        style={[{ flex: 1 }, style]}
      >
        {props.children}
        {pane('prev')}
        {pane('next')}
      </Animated.View>
    </View>
  );
}
