// Dragging entries onto targets (spec 0016, plan decisions 2–5): one DragProvider around the
// area, sources from useDragSource (one file per platform), targets from useDropTarget. During a
// drag only one floating ghost and one highlight move, driven by Reanimated shared values, so
// the targets do not render per move. The session logic lives in drag-controller.ts.

import {
  createContext,
  useContext,
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
  badgeTop,
  createDragController,
  ghostSize,
  ghostStart,
  highlightFilled,
  type DragCallbacks,
  type DragController,
  type DropGrid,
  type DragSink,
} from './drag-controller';
import type { Rect } from './drop-targets';
import { EDGE_ZONE_INSET } from './edge-pager';
import { haptic } from './haptics';
import { Icon, Text } from './primitives';
import { useTheme } from './theme-context';

export { useDragSource } from './drag-source';
export type { DragSourceBinding } from './drag-context';
export type { DragCallbacks, DropGrid } from './drag-controller';

// Snap back after a drag: a spring, fast, no overshoot past the place it came from.
const RETURN_SPRING = { duration: 300, dampingRatio: 0.9 } as const;
const DROP_FADE_MS = 150;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const LABEL_GAP = 6;
/** Room the target label needs above the ghost; with less it hangs below. */
const LABEL_ROOM = 36;
// Lifting: the entry grows a little, critically damped (no bounce: no force was applied yet).
const LIFT_SCALE = 1.03;
const LIFT_SPRING = { duration: 200, dampingRatio: 1 } as const;
const ZONE_FADE_MS = 150;
/** The ‹ › handle sits in the margin the zones keep to the screen edge. */
const EDGE_HANDLE_WIDTH = 16;
const EDGE_HANDLE_HEIGHT = 56;

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
  const ghostHeight = useSharedValue(0);
  const ghostOpacity = useSharedValue(0);
  const ghostScale = useSharedValue(1);
  // The source's own width and grab point: a capped ghost grows back to them on the glide back.
  const sourceWidth = useSharedValue(0);
  const sourceGrabX = useSharedValue(0);
  // The visible part of the drag area in window coordinates: the ghost and badges stay inside.
  const areaX = useSharedValue(0);
  const areaY = useSharedValue(0);
  const areaRight = useSharedValue(0);
  const areaBottom = useSharedValue(0);
  // In the right half of the window the label grows to the left, so it is not cut off.
  const labelEnd = useSharedValue(false);
  const highlight = useSharedValue<{ rect: Rect; allowed: boolean; filled: boolean } | null>(null);

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
        cancelAnimation(ghostScale);
        ghostScale.set(1);
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
      geometry: ({ origin, grab, size, area }) => {
        areaX.set(area.x);
        areaY.set(area.y);
        areaRight.set(area.x + area.width);
        areaBottom.set(area.y + area.height);
        originX.set(origin.x);
        originY.set(origin.y);
        const fitted = ghostSize(size.width, grab.x);
        grabX.set(fitted.grabX);
        grabY.set(grab.y);
        ghostWidth.set(fitted.width);
        ghostHeight.set(size.height);
        sourceWidth.set(size.width);
        sourceGrabX.set(grab.x);
        if (ghostOpacity.get() === 0 && !reducedMotion.get()) {
          ghostScale.set(withSpring(LIFT_SCALE, LIFT_SPRING));
        }
        ghostOpacity.set(1);
      },
      highlight: (rect, allowed) =>
        highlight.set(
          rect
            ? {
                rect,
                allowed,
                filled: highlightFilled(allowed, self.getSnapshot().preview !== null),
              }
            : null,
        ),
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
        ghostScale.set(withSpring(1, RETURN_SPRING));
        ghostWidth.set(withSpring(sourceWidth.get(), RETURN_SPRING));
        grabX.set(withSpring(sourceGrabX.get(), RETURN_SPRING));
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

  const [pointer] = useState<DragPointer>(() => ({
    pointerX,
    pointerY,
    originX,
    originY,
    areaX,
    areaRight,
  }));

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

  // The ghost hangs on the pointer at the grab point but stays inside the window.
  const ghostStyle = useAnimatedStyle(() => {
    const width = ghostWidth.get();
    const left = ghostStart(pointerX.get(), grabX.get(), width, areaX.get(), areaRight.get());
    const top = ghostStart(
      pointerY.get(),
      grabY.get(),
      ghostHeight.get(),
      areaY.get(),
      areaBottom.get(),
    );
    return {
      width,
      opacity: ghostOpacity.get(),
      transform: [
        { translateX: left - originX.get() },
        { translateY: top - originY.get() },
        { scale: ghostScale.get() },
      ],
    };
  });
  // The label grows away from the nearer side edge and hangs below the ghost at the top edge.
  const labelStyle = useAnimatedStyle(() => {
    const top = ghostStart(
      pointerY.get(),
      grabY.get(),
      ghostHeight.get(),
      areaY.get(),
      areaBottom.get(),
    );
    const below = top - areaY.get() < LABEL_ROOM;
    return {
      left: labelEnd.get() ? 'auto' : 0,
      right: labelEnd.get() ? 0 : 'auto',
      top: below ? '100%' : 'auto',
      bottom: below ? 'auto' : '100%',
      marginTop: below ? LABEL_GAP : 0,
      marginBottom: below ? 0 : LABEL_GAP,
    };
  });

  return (
    <View ref={container} style={style} testID={testID}>
      <DragContext.Provider value={controller}>
        <DragPointerContext.Provider value={pointer}>{children}</DragPointerContext.Provider>
      </DragContext.Provider>
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

/** The pointer of the running drag in window coordinates, for badges that follow it. */
interface DragPointer {
  pointerX: Shared<number>;
  pointerY: Shared<number>;
  originX: Shared<number>;
  originY: Shared<number>;
  areaX: Shared<number>;
  areaRight: Shared<number>;
}

const DragPointerContext = createContext<DragPointer | null>(null);

function useDragPointer(): DragPointer {
  const pointer = useContext(DragPointerContext);
  if (!pointer) throw new Error('A DragBadge needs a DragProvider above it.');
  return pointer;
}

/**
 * A badge that floats above the pointer while dragging, centred on it and kept inside the window,
 * e.g. the days of a trip being drawn: near the finger, where the eye is, and never over the
 * header. Render it as a child of the DragProvider while it has something to say.
 */
export function DragBadge(props: { children: ReactNode }) {
  const pointer = useDragPointer();
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const style = useAnimatedStyle(() => {
    const w = width.get();
    const left = ghostStart(
      pointer.pointerX.get(),
      w / 2,
      w,
      pointer.areaX.get(),
      pointer.areaRight.get(),
    );
    return {
      opacity: w > 0 ? 1 : 0,
      transform: [
        { translateX: left - pointer.originX.get() },
        { translateY: badgeTop(pointer.pointerY.get(), height.get()) - pointer.originY.get() },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      onLayout={(event) => {
        width.set(event.nativeEvent.layout.width);
        height.set(event.nativeEvent.layout.height);
      }}
      style={[{ position: 'absolute', left: 0, top: 0, zIndex: 1001, elevation: 1001 }, style]}
    >
      {props.children}
    </Animated.View>
  );
}

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
  props: OverlayPartProps & {
    highlight: Shared<{ rect: Rect; allowed: boolean; filled: boolean } | null>;
  },
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
      backgroundColor: current.filled ? c.accentSoft : 'transparent',
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

/**
 * Slim ‹ and › handles in the margin at the left and right edge while dragging; holding in the
 * zone next to one turns the page and fills it with the accent. They cover no content, so nothing
 * looks refused that is not.
 */
function EdgeZones(props: OverlayPartProps) {
  const snapshot = useSnapshot(props.controller);
  if (snapshot.phase !== 'dragging' || !snapshot.zones) return null;
  const { previous, next } = snapshot.zones;
  return (
    <>
      <EdgeHandle
        x={previous.x - EDGE_ZONE_INSET + (EDGE_ZONE_INSET - EDGE_HANDLE_WIDTH) / 2}
        middleY={previous.y + previous.height / 2}
        active={snapshot.zone === 'previous'}
        icon="chevron-left"
        originX={props.originX}
        originY={props.originY}
      />
      <EdgeHandle
        x={next.x + next.width + (EDGE_ZONE_INSET - EDGE_HANDLE_WIDTH) / 2}
        middleY={next.y + next.height / 2}
        active={snapshot.zone === 'next'}
        icon="chevron-right"
        originX={props.originX}
        originY={props.originY}
      />
    </>
  );
}

function EdgeHandle(props: {
  /** Left edge and vertical middle in window coordinates. */
  x: number;
  middleY: number;
  active: boolean;
  icon: 'chevron-left' | 'chevron-right';
  originX: Shared<number>;
  originY: Shared<number>;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) opacity.set(withTiming(1, { duration: ZONE_FADE_MS, easing: EASE_OUT }));
  }, [opacity, reduced]);
  const { x, middleY, originX, originY } = props;
  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [
      { translateX: x - originX.get() },
      { translateY: middleY - EDGE_HANDLE_HEIGHT / 2 - originY.get() },
    ],
  }));
  return (
    <Animated.View
      testID={`drag-edge-${props.icon === 'chevron-left' ? 'previous' : 'next'}`}
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: EDGE_HANDLE_WIDTH,
          height: EDGE_HANDLE_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.shape.radius.chip,
          backgroundColor: props.active ? c.accent : c.surfaceRaised,
          boxShadow: c.shadowRaised,
        },
        style,
      ]}
    >
      <Icon name={props.icon} size={14} color={props.active ? 'onAccent' : 'muted'} />
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
  // A source without a preview (drawing a range over days) shows only the highlight.
  if (snapshot.phase === 'idle' || snapshot.preview === null) return null;
  const hover = snapshot.hover;
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          borderRadius: theme.shape.radius.control,
          backgroundColor: c.surfaceRaised,
          boxShadow: c.shadowRaised,
        },
        props.style,
      ]}
    >
      {hover?.label ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: theme.shape.radius.chip,
              backgroundColor: hover.allowed ? c.accent : c.warnBg,
            },
            props.labelStyle,
          ]}
        >
          <Text
            variant="smallStrong"
            color={hover.allowed ? 'onAccent' : 'warn'}
            numberOfLines={1}
            testID="drag-label"
          >
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
  /** Not a target now, e.g. while something is dragged that it does not take. */
  disabled?: boolean;
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
  const disabled = options.disabled === true;
  useLayoutEffect(() => {
    if (disabled) return undefined;
    return controller.register(id, {
      measure: (done) => measureNode(ref.current, done),
      get grid() {
        return grid.current;
      },
    });
  }, [controller, id, ref, disabled]);
  const dimmed = useSyncExternalStore(
    controller.subscribe,
    () => !disabled && controller.getSnapshot().phase === 'dragging' && !controller.isAllowed(id),
  );
  return { dimmed, onLayout: controller.layoutChanged };
}

/** The id of the source being dragged (or gliding back), else null; e.g. to show empty slots. */
export function useDraggedSource(): string | null {
  const controller = useDragController();
  return useSyncExternalStore(controller.subscribe, () => controller.getSnapshot().sourceId);
}

/**
 * Like `useDraggedSource`, but only once the source was measured after lifting: a layout change
 * it causes (e.g. empty slots that appear as targets) then does not shift where it was grabbed.
 */
export function useLiftedSource(): string | null {
  const controller = useDragController();
  return useSyncExternalStore(controller.subscribe, () => {
    const snapshot = controller.getSnapshot();
    return snapshot.sourceRect === null ? null : snapshot.sourceId;
  });
}
