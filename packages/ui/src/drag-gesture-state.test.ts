import { describe, expect, it } from 'vitest';

import {
  DRAG_IDLE,
  blockDisabledLift,
  dragGestureStep,
  pendingLiftAt,
  type DragGestureEvent,
  type DragGestureState,
  type DragGestureStep,
} from './drag-gesture-state';

/** Runs the events in order and returns every step. */
function run(events: DragGestureEvent[], from: DragGestureState = DRAG_IDLE): DragGestureStep[] {
  const steps: DragGestureStep[] = [];
  let state = from;
  for (const event of events) {
    const step = dragGestureStep(state, event);
    steps.push(step);
    state = step.state;
  }
  return steps;
}

const last = (steps: DragGestureStep[]): DragGestureStep => {
  const step = steps[steps.length - 1];
  if (!step) throw new Error('no steps');
  return step;
};

const touchDown: DragGestureEvent = {
  type: 'down',
  pointerId: 1,
  kind: 'touch',
  point: { x: 100, y: 100 },
  time: 0,
};
const mouseDown: DragGestureEvent = { ...touchDown, kind: 'mouse' };

/** A touch held for 400 ms: the entry is lifted. */
const touchLifted = (): DragGestureState =>
  last(run([touchDown, { type: 'tick', time: 400 }])).state;

describe('drag gesture: mouse', () => {
  it('starts dragging once the mouse has moved 4 px with the button down', () => {
    const steps = run([
      mouseDown,
      { type: 'move', pointerId: 1, point: { x: 103, y: 100 }, time: 10 },
      { type: 'move', pointerId: 1, point: { x: 104, y: 100 }, time: 20 },
    ]);
    expect(steps[1]?.state.phase).toBe('pressed');
    expect(steps[1]?.effect).toBeNull();
    expect(steps[2]?.state.phase).toBe('dragging');
    expect(steps[2]?.effect).toEqual({ type: 'lift' });
  });

  it('never lifts by holding still: a mouse press without movement is a click', () => {
    const steps = run([
      mouseDown,
      { type: 'tick', time: 5000 },
      { type: 'up', pointerId: 1, point: { x: 100, y: 100 }, time: 5001, target: 'fri-evening' },
      { type: 'click' },
    ]);
    expect(steps.map((step) => step.effect)).toEqual([null, null, null, null]);
    expect(last(steps).state.phase).toBe('idle');
    expect(pendingLiftAt(steps[0]?.state ?? DRAG_IDLE)).toBeNull();
  });

  it('follows the pointer while dragging', () => {
    const steps = run([
      mouseDown,
      { type: 'move', pointerId: 1, point: { x: 120, y: 100 }, time: 10 },
      { type: 'move', pointerId: 1, point: { x: 180, y: 140 }, time: 20 },
    ]);
    const state = last(steps).state;
    expect(state.phase === 'dragging' && state.point).toEqual({ x: 180, y: 140 });
    expect(last(steps).effect).toBeNull();
  });
});

describe('drag gesture: touch', () => {
  it('lifts after holding 400 ms without moving more than 8 px', () => {
    const steps = run([
      touchDown,
      { type: 'move', pointerId: 1, point: { x: 106, y: 105 }, time: 200 },
      { type: 'tick', time: 399 },
      { type: 'tick', time: 400 },
    ]);
    expect(steps[2]?.state.phase).toBe('pressed');
    expect(steps[3]?.state.phase).toBe('dragging');
    expect(steps[3]?.effect).toEqual({ type: 'lift' });
  });

  it('tells when the hold is due, so a timer can deliver the tick', () => {
    const pressed = last(run([touchDown])).state;
    expect(pendingLiftAt(pressed)).toBe(400);
    expect(pendingLiftAt(DRAG_IDLE)).toBeNull();
    expect(pendingLiftAt(touchLifted())).toBeNull();
  });

  it('a late move after the hold time also lifts', () => {
    const step = last(
      run([touchDown, { type: 'move', pointerId: 1, point: { x: 102, y: 100 }, time: 450 }]),
    );
    expect(step.state.phase).toBe('dragging');
    expect(step.effect).toEqual({ type: 'lift' });
  });

  it('AC-004: a short tap opens the entry: nothing lifts and the click passes', () => {
    const steps = run([
      touchDown,
      { type: 'up', pointerId: 1, point: { x: 101, y: 100 }, time: 120, target: 'wed-evening' },
      { type: 'click' },
    ]);
    expect(steps.map((step) => step.effect)).toEqual([null, null, null]);
    expect(last(steps).state.phase).toBe('idle');
  });

  it('AC-004: a swipe before the hold scrolls: nothing lifts, also not later', () => {
    const steps = run([
      touchDown,
      { type: 'move', pointerId: 1, point: { x: 100, y: 91 }, time: 100 },
      { type: 'tick', time: 400 },
      { type: 'move', pointerId: 1, point: { x: 100, y: 20 }, time: 500 },
      { type: 'up', pointerId: 1, point: { x: 100, y: 20 }, time: 600, target: 'fri-evening' },
    ]);
    expect(steps[1]?.state.phase).toBe('idle');
    expect(steps.map((step) => step.effect)).toEqual([null, null, null, null, null]);
  });

  it('exactly 8 px of movement still counts as holding', () => {
    const step = last(
      run([
        touchDown,
        { type: 'move', pointerId: 1, point: { x: 100, y: 108 }, time: 100 },
        { type: 'tick', time: 400 },
      ]),
    );
    expect(step.state.phase).toBe('dragging');
  });
});

describe('drag gesture: drop and cancel', () => {
  it('releasing over a target drops on it', () => {
    const step = dragGestureStep(touchLifted(), {
      type: 'up',
      pointerId: 1,
      point: { x: 300, y: 200 },
      time: 900,
      target: 'fri-evening',
    });
    expect(step.effect).toEqual({ type: 'drop', target: 'fri-evening' });
    expect(step.state.phase).toBe('idle');
  });

  it('AC-003: releasing over no target cancels', () => {
    const step = dragGestureStep(touchLifted(), {
      type: 'up',
      pointerId: 1,
      point: { x: 300, y: -10 },
      time: 900,
      target: null,
    });
    expect(step.effect).toEqual({ type: 'cancel' });
    expect(step.state.phase).toBe('idle');
  });

  it('AC-003: Escape cancels the drag, and the release that follows does nothing', () => {
    const steps = run(
      [
        { type: 'key', key: 'Escape' },
        { type: 'up', pointerId: 1, point: { x: 300, y: 200 }, time: 900, target: 'fri-evening' },
      ],
      touchLifted(),
    );
    expect(steps[0]?.effect).toEqual({ type: 'cancel' });
    expect(steps[0]?.state.phase).toBe('idle');
    expect(steps[1]?.effect).toBeNull();
  });

  it('other keys do not cancel', () => {
    const step = dragGestureStep(touchLifted(), { type: 'key', key: 'ArrowLeft' });
    expect(step.state.phase).toBe('dragging');
    expect(step.effect).toBeNull();
  });

  it('a second pointer cancels a drag', () => {
    const step = dragGestureStep(touchLifted(), {
      type: 'down',
      pointerId: 2,
      kind: 'touch',
      point: { x: 10, y: 10 },
      time: 700,
    });
    expect(step.effect).toEqual({ type: 'cancel' });
    expect(step.state.phase).toBe('idle');
  });

  it('a second pointer before the hold ends the press without lifting (pinch)', () => {
    const steps = run([
      touchDown,
      { type: 'down', pointerId: 2, kind: 'touch', point: { x: 10, y: 10 }, time: 100 },
      { type: 'tick', time: 400 },
    ]);
    expect(steps.map((step) => step.effect)).toEqual([null, null, null]);
    expect(last(steps).state.phase).toBe('idle');
  });

  it('a cancel from outside (pointer cancel, scroll takeover, back) cancels the drag', () => {
    const step = dragGestureStep(touchLifted(), { type: 'cancel' });
    expect(step.effect).toEqual({ type: 'cancel' });
    expect(step.state.phase).toBe('idle');
    expect(dragGestureStep(last(run([touchDown])).state, { type: 'cancel' }).effect).toBeNull();
  });

  it('ignores moves and releases of another pointer', () => {
    const lifted = touchLifted();
    const moved = dragGestureStep(lifted, {
      type: 'move',
      pointerId: 7,
      point: { x: 500, y: 500 },
      time: 500,
    });
    expect(moved.state).toEqual(lifted);
    const released = dragGestureStep(lifted, {
      type: 'up',
      pointerId: 7,
      point: { x: 500, y: 500 },
      time: 500,
      target: 'x',
    });
    expect(released.state).toEqual(lifted);
    expect(released.effect).toBeNull();
  });
});

describe('drag gesture: the click after a drag', () => {
  it('swallows the click right after a drop or a cancel, once', () => {
    for (const target of ['fri-evening', null]) {
      const steps = run(
        [
          { type: 'up', pointerId: 1, point: { x: 300, y: 200 }, time: 900, target },
          { type: 'click' },
          { type: 'click' },
        ],
        touchLifted(),
      );
      expect(steps[1]?.effect).toEqual({ type: 'swallowClick' });
      expect(steps[2]?.effect).toBeNull();
    }
  });

  it('a new press clears it, so the next real tap is not swallowed', () => {
    const steps = run(
      [
        { type: 'up', pointerId: 1, point: { x: 300, y: 200 }, time: 900, target: 'fri-evening' },
        { ...touchDown, time: 2000 },
        { type: 'up', pointerId: 1, point: { x: 100, y: 100 }, time: 2100, target: null },
        { type: 'click' },
      ],
      touchLifted(),
    );
    expect(last(steps).effect).toBeNull();
  });

  it('a click without a drag passes', () => {
    expect(dragGestureStep(DRAG_IDLE, { type: 'click' }).effect).toBeNull();
  });
});

describe('drag gesture: offline source', () => {
  /** The steps of a disabled source, as the drag source runs them. */
  function runDisabled(events: DragGestureEvent[]): DragGestureStep[] {
    const steps: DragGestureStep[] = [];
    let state = DRAG_IDLE;
    for (const event of events) {
      const step = blockDisabledLift(dragGestureStep(state, event), true);
      steps.push(step);
      state = step.state;
    }
    return steps;
  }

  it('AC-005: a held finger lifts nothing; the hint is due and the click of the press is swallowed', () => {
    const steps = runDisabled([
      touchDown,
      { type: 'tick', time: 400 },
      { type: 'move', pointerId: 1, point: { x: 300, y: 200 }, time: 500 },
      { type: 'up', pointerId: 1, point: { x: 300, y: 200 }, time: 600, target: 'fri-evening' },
      { type: 'click' },
    ]);
    expect(steps[1]?.effect).toEqual({ type: 'blocked' });
    expect(steps.some((step) => step.state.phase === 'dragging')).toBe(false);
    expect(steps.some((step) => step.effect?.type === 'lift' || step.effect?.type === 'drop')).toBe(
      false,
    );
    expect(last(steps).effect).toEqual({ type: 'swallowClick' });
  });

  it('AC-005: a mouse drag lifts nothing and the hint is due', () => {
    const steps = runDisabled([
      mouseDown,
      { type: 'move', pointerId: 1, point: { x: 110, y: 100 }, time: 10 },
      { type: 'move', pointerId: 1, point: { x: 300, y: 200 }, time: 20 },
      { type: 'up', pointerId: 1, point: { x: 300, y: 200 }, time: 30, target: 'fri-evening' },
    ]);
    expect(steps[1]?.effect).toEqual({ type: 'blocked' });
    expect(steps.map((step) => step.state.phase)).toEqual(['pressed', 'idle', 'idle', 'idle']);
    expect(steps.slice(2).map((step) => step.effect)).toEqual([null, null]);
  });

  it('AC-005: offline a short tap still opens the entry', () => {
    const steps = runDisabled([
      touchDown,
      { type: 'up', pointerId: 1, point: { x: 101, y: 100 }, time: 120, target: null },
      { type: 'click' },
    ]);
    expect(steps.map((step) => step.effect)).toEqual([null, null, null]);
  });

  it('an enabled source lifts as usual', () => {
    const step = blockDisabledLift(dragGestureStep(DRAG_IDLE, touchDown), false);
    const lifted = blockDisabledLift(
      dragGestureStep(step.state, { type: 'tick', time: 400 }),
      false,
    );
    expect(lifted.effect).toEqual({ type: 'lift' });
    expect(lifted.state.phase).toBe('dragging');
  });
});
