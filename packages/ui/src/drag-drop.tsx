// Dragging entries onto targets (spec 0016, plan decisions 2–5): one DragProvider around the
// area, sources from useDragSource (one file per platform), targets from useDropTarget. During a
// drag only one floating ghost and one highlight move, driven by Reanimated shared values, so
// the targets do not render per move. The session logic lives in drag-controller.ts.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  BackHandler,
  Dimensions,
  Platform,
  View,
  type HostInstance,
  type NativeEventSubscription,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { DragContext, measureNode, useDragController } from './drag-context';
import {
  createDragController,
  type DragCallbacks,
  type DragController,
  type DropGrid,
  type DragSink,
} from './drag-controller';
import type { Rect } from './drop-targets';
import { haptic } from './haptics';
import { Icon, Text } from './primitives';
import { useTheme } from './theme-context';

export { useDragSource } from './drag-source';
export type { DragSourceBinding, DragSourceOptions } from './drag-context';
export type { DragCallbacks, DropGrid } from './drag-controller';

// Snap back after a drag: a spring, fast, no overshoot past the place it came from.
const RETURN_SPRING = { duration: 300, dampingRatio: 0.9 } as const;
const DROP_FADE_MS = 150;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const LABEL_GAP = 6;

export interface DragProviderProps extends DragCallbacks {
  children?: ReactNode;
  /** The provider is a View around the drag area, e.g. `{ flex: 1 }` around a Screen. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The drag area: holds the session, measures the targets when an entry lifts, after a page
 * turned and after scrolling along, and draws the ghost, the highlight and the paging zones over
 * its children. Cancel paths: released over no target, Escape and a second pointer (in the
 * source), Android back (here), a scroll taking over. Wrap it around the Screen, so the ghost is
 * not clipped by the scrolling page.
 */
export function DragProvider(props: DragProviderProps) {
  const reduced = useReducedMotion();
  const reducedMotion = useSharedValue(reduced);
  useEffect(() => {
    reducedMotion.set(reduced);
  }, [reduced, reducedMotion]);

  // Window coordinates of the pointer, the drag area, the grab point and the source's size.
  const pointerX = useSharedValue(0);
  const pointerY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(0);
  const ghostWidth = useSharedValue(0);
  const ghostOpacity = useSharedValue(0);
  // In the right half of the window the label grows to the left, so it is not cut off.
  const labelEnd = useSharedValue(false);
  const highlight = useSharedValue<{ rect: Rect; allowed: boolean } | null>(null);

  const [controller] = useState(() => {
    let loop = 0;
    let back: NativeEventSubscription | undefined;
    const endSession = () => {
      loop += 1;
      back?.remove();
      back = undefined;
    };
    const settle = () => self.settled();
    const sink: DragSink = {
      lift: () => {
        haptic('lift');
        ghostOpacity.set(0);
        // Android back cancels a drag before it closes anything else (no such key on the web).
        if (Platform.OS !== 'web') {
          back = BackHandler.addEventListener('hardwareBackPress', () => {
            self.abort();
            return true;
          });
        }
        loop += 1;
        const mine = loop;
        const tick = (time: number) => {
          if (mine !== loop) return;
          self.frame(time);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      pointer: (point) => {
        cancelAnimation(pointerX);
        cancelAnimation(pointerY);
        pointerX.set(point.x);
        pointerY.set(point.y);
        labelEnd.set(point.x > Dimensions.get('window').width / 2);
      },
      geometry: ({ origin, grab, size }) => {
        originX.set(origin.x);
        originY.set(origin.y);
        grabX.set(grab.x);
        grabY.set(grab.y);
        ghostWidth.set(size.width);
        ghostOpacity.set(1);
      },
      highlight: (rect, allowed) => highlight.set(rect ? { rect, allowed } : null),
      end: (outcome, returnTo) => {
        endSession();
        if (outcome === 'drop') haptic('drop');
        // Reduced motion: no flight and no glide back; the entry stands at once where it ends.
        if (reducedMotion.get() || (outcome === 'return' && returnTo === null)) {
          ghostOpacity.set(0);
          settle();
          return;
        }
        if (outcome === 'drop') {
          ghostOpacity.set(
            withTiming(0, { duration: DROP_FADE_MS, easing: EASE_OUT }, () => {
              scheduleOnRN(settle);
            }),
          );
          return;
        }
        if (!returnTo) return;
        pointerX.set(withSpring(returnTo.x, RETURN_SPRING));
        pointerY.set(
          withSpring(returnTo.y, RETURN_SPRING, () => {
            ghostOpacity.set(0);
            scheduleOnRN(settle);
          }),
        );
      },
    };
    const self: DragController<ReactNode> = createDragController<ReactNode>(sink, () =>
      Dimensions.get('window'),
    );
    return self;
  });

  const container = useRef<HostInstance>(null);
  useLayoutEffect(() => {
    controller.setContainer((done) => measureNode(container.current, done));
  }, [controller]);
  const { children, style, testID, ...callbacks } = props;
  useLayoutEffect(() => {
    controller.setCallbacks(callbacks);
  });
  // Leaving the screen mid-drag ends the drag.
  useEffect(() => () => controller.abort(), [controller]);

  const ghostStyle = useAnimatedStyle(() => ({
    width: ghostWidth.get(),
    opacity: ghostOpacity.get(),
    transform: [
      { translateX: pointerX.get() - originX.get() - grabX.get() },
      { translateY: pointerY.get() - originY.get() - grabY.get() },
    ],
  }));
  const labelStyle = useAnimatedStyle(() =>
    labelEnd.get() ? { left: 'auto', right: 0 } : { left: 0, right: 'auto' },
  );

  return (
    <View ref={container} style={style} testID={testID}>
      <DragContext.Provider value={controller}>{children}</DragContext.Provider>
      <View pointerEvents="none" style={OVERLAY}>
        <DropHighlight
          highlight={highlight}
          originX={originX}
          originY={originY}
          controller={controller}
        />
        <EdgeZones controller={controller} originX={originX} originY={originY} />
        <DragGhost controller={controller} style={ghostStyle} labelStyle={labelStyle} />
      </View>
    </View>
  );
}

const OVERLAY: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1000,
  elevation: 1000,
};

type Shared<T> = ReturnType<typeof useSharedValue<T>>;

interface OverlayPartProps {
  controller: DragController<ReactNode>;
  originX: Shared<number>;
  originY: Shared<number>;
}

function useSnapshot(controller: DragController<ReactNode>) {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}

/** The one highlight over the target under the pointer; refused targets get a muted frame. */
function DropHighlight(
  props: OverlayPartProps & { highlight: Shared<{ rect: Rect; allowed: boolean } | null> },
) {
  const theme = useTheme();
  const c = theme.colors;
  const radius = theme.shape.radius.control;
  const { highlight, originX, originY } = props;
  const style = useAnimatedStyle(() => {
    const current = highlight.get();
    if (!current) return { opacity: 0, width: 0, height: 0 };
    return {
      opacity: 1,
      width: current.rect.width,
      height: current.rect.height,
      borderColor: current.allowed ? c.accent : c.textMuted,
      backgroundColor: current.allowed ? c.accentSoft : 'transparent',
      transform: [
        { translateX: current.rect.x - originX.get() },
        { translateY: current.rect.y - originY.get() },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: 0, top: 0, borderWidth: 2, borderRadius: radius },
        style,
      ]}
    />
  );
}

/** ‹ and › at the left and right edge while dragging, where holding turns the page. */
function EdgeZones(props: OverlayPartProps) {
  const snapshot = useSnapshot(props.controller);
  if (snapshot.phase !== 'dragging' || !snapshot.zones) return null;
  return (
    <>
      <EdgeZone
        rect={snapshot.zones.previous}
        active={snapshot.zone === 'previous'}
        icon="chevron-left"
        originX={props.originX}
        originY={props.originY}
      />
      <EdgeZone
        rect={snapshot.zones.next}
        active={snapshot.zone === 'next'}
        icon="chevron-right"
        originX={props.originX}
        originY={props.originY}
      />
    </>
  );
}

function EdgeZone(props: {
  rect: Rect;
  active: boolean;
  icon: 'chevron-left' | 'chevron-right';
  originX: Shared<number>;
  originY: Shared<number>;
}) {
  const theme = useTheme();
  const { rect, originX, originY } = props;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: rect.x - originX.get() }, { translateY: rect.y - originY.get() }],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: rect.width,
          height: rect.height,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.shape.radius.control,
          backgroundColor: props.active ? theme.colors.accentSoft : theme.colors.surfaceSunken,
          opacity: props.active ? 0.95 : 0.7,
        },
        style,
      ]}
    >
      <Icon name={props.icon} size={24} color={props.active ? 'accent' : 'muted'} />
    </Animated.View>
  );
}

/** The dragged entry on the pointer, with the feature's label of the target above it. */
function DragGhost(props: {
  controller: DragController<ReactNode>;
  style: ReturnType<typeof useAnimatedStyle>;
  labelStyle: ReturnType<typeof useAnimatedStyle>;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const snapshot = useSnapshot(props.controller);
  if (snapshot.phase === 'idle') return null;
  const hover = snapshot.hover;
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          borderRadius: theme.shape.radius.control,
          backgroundColor: c.surface,
          boxShadow: '0px 8px 24px rgba(0,0,0,0.18), 0px 1px 3px rgba(0,0,0,0.16)',
        },
        props.style,
      ]}
    >
      {hover?.label ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              bottom: '100%',
              marginBottom: LABEL_GAP,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: theme.shape.radius.chip,
              backgroundColor: hover.allowed ? c.accent : c.warnBg,
            },
            props.labelStyle,
          ]}
        >
          <Text variant="smallStrong" color={hover.allowed ? 'onAccent' : 'warn'} numberOfLines={1}>
            {hover.label}
          </Text>
        </Animated.View>
      ) : null}
      {snapshot.preview}
    </Animated.View>
  );
}

export interface DropTargetOptions {
  /** A month as one target, resolved to the day under the pointer (12 measurements, not 365). */
  grid?: DropGrid;
}

export interface DropTargetState {
  /** A drag runs and `isAllowed` refuses this target: show it pale (AC-015). */
  dimmed: boolean;
  /** Pass to the target View's onLayout, so a layout change during a drag is measured again. */
  onLayout: () => void;
}

/**
 * Registers a View as a drop target under `id` (a grid: its days via `grid.cellId`). It is
 * measured only when an entry lifts, after a page turned and after scrolling along.
 */
export function useDropTarget(
  id: string,
  ref: RefObject<HostInstance | null>,
  options: DropTargetOptions = {},
): DropTargetState {
  const controller = useDragController();
  const grid = useRef(options.grid);
  useLayoutEffect(() => {
    grid.current = options.grid;
  });
  useLayoutEffect(
    () =>
      controller.register(id, {
        measure: (done) => measureNode(ref.current, done),
        get grid() {
          return grid.current;
        },
      }),
    [controller, id, ref],
  );
  const dimmed = useSyncExternalStore(
    controller.subscribe,
    () => controller.getSnapshot().phase === 'dragging' && !controller.isAllowed(id),
  );
  return { dimmed, onLayout: controller.layoutChanged };
}

/** The id of the source being dragged (or gliding back), else null; e.g. to show empty slots. */
export function useDraggedSource(): string | null {
  const controller = useDragController();
  return useSyncExternalStore(controller.subscribe, () => controller.getSnapshot().sourceId);
}
