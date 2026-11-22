// The part of a drag source both platforms share: the gesture state machine with its hold timer,
// and what its effects do to the drag session. The platform files only turn their input events
// into DragGestureEvents.

import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { HostInstance } from 'react-native';

import { measureNode, useDragController, type DragSourceOptions } from './drag-context';
import {
  DRAG_IDLE,
  dragGestureStep,
  pendingLiftAt,
  type DragEffect,
  type DragGestureEvent,
  type DragGestureState,
} from './drag-gesture-state';
import { PageScrollControlContext, type PageScrollControl } from './shell';

export interface GesturePlatform {
  /** The entry lifted. */
  onLift?: (scroll: PageScrollControl | undefined) => void;
  /** A lifted entry was dropped or the drag cancelled. */
  onEnd?: (scroll: PageScrollControl | undefined) => void;
  /** The gesture is over (also a tap, or a press that turned into scrolling). */
  onIdle?: () => void;
}

export interface DragGesture {
  dispatch: (event: DragGestureEvent) => DragEffect | null;
  phase: () => DragGestureState['phase'];
  /** Ref callback of the source view, for measuring. */
  setNode: (node: HostInstance | null) => void;
  dragging: boolean;
  guardPress: <A extends unknown[]>(
    handler: ((...args: A) => void) | undefined,
  ) => ((...args: A) => void) | undefined;
}

export function useDragGesture(options: DragSourceOptions, platform: GesturePlatform): DragGesture {
  const controller = useDragController();
  const scroll = useContext(PageScrollControlContext);
  const node = useRef<HostInstance | null>(null);
  const state = useRef<DragGestureState>(DRAG_IDLE);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ options, platform, scroll });
  useLayoutEffect(() => {
    latest.current = { options, platform, scroll };
  });

  const { id } = options;
  const dragging = useSyncExternalStore(
    controller.subscribe,
    () => controller.getSnapshot().sourceId === id,
  );

  const [api] = useState(() => {
    const dispatch = (input: DragGestureEvent): DragEffect | null => {
      // On release the session knows the target under the pointer; the machine only needs to
      // know whether there is one.
      const event: DragGestureEvent =
        input.type === 'up'
          ? { ...input, target: controller.getSnapshot().hover?.id ?? null }
          : input;
      const step = dragGestureStep(state.current, event);
      state.current = step.state;
      clearTimeout(timer.current);
      const liftAt = pendingLiftAt(step.state);
      if (liftAt !== null) {
        timer.current = setTimeout(
          () => dispatch({ type: 'tick', time: Date.now() }),
          Math.max(0, liftAt - Date.now()),
        );
      }
      if (step.state.phase === 'dragging' && event.type === 'move') controller.move(event.point);

      const { options: current, platform: host, scroll: page } = latest.current;
      switch (step.effect?.type) {
        case 'lift': {
          if (current.disabled || step.state.phase !== 'dragging') {
            // Offline: nothing lifts, and the click of this press must not open the entry.
            state.current = { phase: 'idle', swallowClick: true };
            current.onBlocked?.();
            break;
          }
          const lifted = controller.lift({
            sourceId: current.id,
            point: step.state.point,
            preview: current.preview(),
            measureSource: (done) => measureNode(node.current, done),
            scroller: page,
            onAbort: () => dispatch({ type: 'cancel' }),
          });
          if (lifted) host.onLift?.(page);
          else state.current = DRAG_IDLE;
          break;
        }
        case 'drop':
          controller.release();
          host.onEnd?.(page);
          break;
        case 'cancel':
          controller.cancel();
          host.onEnd?.(page);
          break;
        default:
          break;
      }
      if (state.current.phase === 'idle') host.onIdle?.();
      return step.effect;
    };

    const guardPress = <A extends unknown[]>(handler: ((...args: A) => void) | undefined) =>
      handler &&
      ((...args: A) => {
        if (state.current.phase === 'dragging') return;
        const step = dragGestureStep(state.current, { type: 'click' });
        state.current = step.state;
        if (step.effect?.type === 'swallowClick') return;
        handler(...args);
      });

    return { dispatch, phase: () => state.current.phase, guardPress };
  });

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const setNode = useCallback((instance: HostInstance | null) => {
    node.current = instance;
  }, []);

  return { ...api, setNode, dragging };
}
