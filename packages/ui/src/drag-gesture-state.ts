// The gesture of dragging an entry (spec 0016, plan decisions 2 and 5) as a pure state machine:
// time, positions and the target under the pointer are inputs, so the web and the native drag
// source share it and it is tested in Node. The caller turns pointer events, a hold timer
// (`pendingLiftAt`), Escape and a scroll takeover into events and acts on the effects.

import type { Point } from './drop-targets';

/** A mouse drag starts once the pointer has moved this far with the button down. */
const MOUSE_DRAG_DISTANCE = 4;
/** A finger lifts the entry after holding this long … */
const TOUCH_HOLD_MS = 400;
/** … without moving further than this; moving further first means the person scrolls. */
const TOUCH_SLOP = 8;

/** A pen behaves like a finger: the caller passes it as `touch`. */
export type PointerKind = 'mouse' | 'touch';

export type DragGestureState =
  | { phase: 'idle'; swallowClick: boolean }
  | { phase: 'pressed'; pointerId: number; kind: PointerKind; start: Point; startTime: number }
  | { phase: 'dragging'; pointerId: number; kind: PointerKind; start: Point; point: Point };

export type DragGestureEvent =
  | { type: 'down'; pointerId: number; kind: PointerKind; point: Point; time: number }
  | { type: 'move'; pointerId: number; point: Point; time: number }
  /** The hold timer fired. */
  | { type: 'tick'; time: number }
  /** `target`: the drop target under the pointer (`hitTest`), or null. */
  | { type: 'up'; pointerId: number; point: Point; time: number; target: string | null }
  | { type: 'key'; key: string }
  /** Pointer cancel, a scroll view taking over, Android back. */
  | { type: 'cancel' }
  | { type: 'click' };

export type DragEffect =
  | { type: 'lift' }
  | { type: 'drop'; target: string }
  | { type: 'cancel' }
  /** Stop this click: it ends a drag and must not open the entry. */
  | { type: 'swallowClick' }
  /** A disabled (offline) source would have lifted: show the hint instead (AC-005). */
  | { type: 'blocked' };

export interface DragGestureStep {
  state: DragGestureState;
  effect: DragEffect | null;
}

export const DRAG_IDLE: DragGestureState = { phase: 'idle', swallowClick: false };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const stay = (state: DragGestureState): DragGestureStep => ({ state, effect: null });
const toIdle = (effect: DragEffect | null = null): DragGestureStep => ({
  state: { phase: 'idle', swallowClick: effect !== null },
  effect,
});
const lift = (state: Pressed, point: Point): DragGestureStep => ({
  state: {
    phase: 'dragging',
    pointerId: state.pointerId,
    kind: state.kind,
    start: state.start,
    point,
  },
  effect: { type: 'lift' },
});

/** When a held finger lifts the entry, so the caller can set a timer for the tick; else null. */
export function pendingLiftAt(state: DragGestureState): number | null {
  return state.phase === 'pressed' && state.kind === 'touch'
    ? state.startTime + TOUCH_HOLD_MS
    : null;
}

type Pressed = Extract<DragGestureState, { phase: 'pressed' }>;
type Dragging = Extract<DragGestureState, { phase: 'dragging' }>;

function fromIdle(
  state: Extract<DragGestureState, { phase: 'idle' }>,
  event: DragGestureEvent,
): DragGestureStep {
  if (event.type === 'down') {
    // A new press also forgets a click still to swallow, so the next real tap passes.
    return stay({
      phase: 'pressed',
      pointerId: event.pointerId,
      kind: event.kind,
      start: event.point,
      startTime: event.time,
    });
  }
  if (event.type === 'click' && state.swallowClick) {
    return { state: DRAG_IDLE, effect: { type: 'swallowClick' } };
  }
  return stay(state);
}

function fromPressed(state: Pressed, event: DragGestureEvent): DragGestureStep {
  switch (event.type) {
    case 'down':
      // A second pointer (a pinch) ends the press without lifting.
      return event.pointerId === state.pointerId ? stay(state) : toIdle();
    case 'move': {
      if (event.pointerId !== state.pointerId) return stay(state);
      const moved = distance(event.point, state.start);
      if (state.kind === 'mouse') {
        return moved >= MOUSE_DRAG_DISTANCE ? lift(state, event.point) : stay(state);
      }
      if (moved > TOUCH_SLOP) return toIdle();
      return event.time - state.startTime >= TOUCH_HOLD_MS ? lift(state, event.point) : stay(state);
    }
    case 'tick':
      return state.kind === 'touch' && event.time - state.startTime >= TOUCH_HOLD_MS
        ? lift(state, state.start)
        : stay(state);
    case 'up':
      // Released before the drag began: a tap or click, which passes.
      return event.pointerId === state.pointerId ? toIdle() : stay(state);
    case 'key':
      return event.key === 'Escape' ? toIdle() : stay(state);
    case 'cancel':
      return toIdle();
    case 'click':
      return stay(state);
  }
}

function fromDragging(state: Dragging, event: DragGestureEvent): DragGestureStep {
  switch (event.type) {
    case 'down':
      return event.pointerId === state.pointerId ? stay(state) : toIdle({ type: 'cancel' });
    case 'move':
      return event.pointerId === state.pointerId
        ? stay({ ...state, point: event.point })
        : stay(state);
    case 'up':
      if (event.pointerId !== state.pointerId) return stay(state);
      return toIdle(
        event.target === null ? { type: 'cancel' } : { type: 'drop', target: event.target },
      );
    case 'key':
      return event.key === 'Escape' ? toIdle({ type: 'cancel' }) : stay(state);
    case 'cancel':
      return toIdle({ type: 'cancel' });
    case 'tick':
    case 'click':
      return stay(state);
  }
}

/**
 * Offline (AC-005) a source must not lift: the press ends where it would have lifted, and the
 * click of this press is swallowed so it does not open the entry either.
 */
export function blockDisabledLift(step: DragGestureStep, disabled: boolean): DragGestureStep {
  if (!disabled || step.effect?.type !== 'lift') return step;
  return { state: { phase: 'idle', swallowClick: true }, effect: { type: 'blocked' } };
}

export function dragGestureStep(state: DragGestureState, event: DragGestureEvent): DragGestureStep {
  switch (state.phase) {
    case 'idle':
      return fromIdle(state, event);
    case 'pressed':
      return fromPressed(state, event);
    case 'dragging':
      return fromDragging(state, event);
  }
}
