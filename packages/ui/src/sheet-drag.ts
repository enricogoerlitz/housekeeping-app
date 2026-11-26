// Dragging a phone window down to close it (spec 0033, REQ-001, decision 1). Pure decisions, so
// the gesture is tested in Node; sheet-drag-events.web.ts feeds in the finger's numbers.

/** Share of the window's height from which a release closes it. */
const SHEET_DISMISS_SHARE = 0.3;
/** Release speed (px/ms, down positive) from which a flick closes the window. */
const SHEET_FLICK_VELOCITY = 0.5;
/** Movement (px) up to which a press on the header is still a tap. */
const SLOP = 4;
/** How far the window can be pulled up past its place, and how stiff that feels. */
const RUBBER_LIMIT = 40;
const RUBBER_STIFFNESS = 0.55;
/** Only the last part of the movement counts for the speed of a release. */
const VELOCITY_WINDOW_MS = 100;

/** Where the window stands while the finger has moved `dy` from where it touched (down positive). */
export function sheetDragOffset(dy: number): number {
  if (dy >= 0) return dy;
  const excess = -dy;
  return -RUBBER_LIMIT * (1 - 1 / ((excess * RUBBER_STIFFNESS) / RUBBER_LIMIT + 1));
}

/**
 * Who owns a move. On the header every vertical move drags the window. In the content only a
 * move down while the content stands at its top does; everything else scrolls the content.
 */
export function sheetDragClaim(input: {
  from: 'header' | 'content';
  dx: number;
  dy: number;
  scrollTop: number;
}): 'drag' | 'native' | 'undecided' {
  const { dx, dy } = input;
  const vertical = Math.abs(dy) >= Math.abs(dx);
  if (input.from === 'header') {
    if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return 'undecided';
    return vertical ? 'drag' : 'native';
  }
  if (dx === 0 && dy === 0) return 'undecided';
  // The first move decides: a browser that started scrolling cannot be stopped any more.
  return input.scrollTop <= 0 && dy > 0 && vertical ? 'drag' : 'native';
}

/**
 * On release: a flick down closes, as does a window pulled past the threshold unless it was flung
 * back up; everything else springs back.
 */
export function sheetDragRelease(input: {
  offset: number;
  height: number;
  /** px/ms, down positive. */
  velocity: number;
}): 'dismiss' | 'stay' {
  const { offset, height, velocity } = input;
  if (offset > 0 && velocity > SHEET_FLICK_VELOCITY) return 'dismiss';
  const far = height > 0 && offset >= height * SHEET_DISMISS_SHARE;
  return far && velocity >= -SHEET_FLICK_VELOCITY ? 'dismiss' : 'stay';
}

export interface DragSample {
  y: number;
  /** ms */
  t: number;
}

/** Speed of the finger over its last 100 ms in px/ms, down positive. */
export function releaseVelocity(samples: readonly DragSample[]): number {
  const last = samples.at(-1);
  if (!last) return 0;
  const recent = samples.filter((sample) => last.t - sample.t <= VELOCITY_WINDOW_MS);
  const first = recent[0];
  if (!first || last.t === first.t) return 0;
  return (last.y - first.y) / (last.t - first.t);
}

/**
 * The theme's raised shadow falling upwards, for a window that rises from the bottom edge
 * (decision 2): only the vertical offsets turn round.
 */
export function upwardShadow(shadow: string): string {
  return shadow.replace(
    /(^|,\s*)(-?[\d.]+px)\s+([\d.]+)px/g,
    (_match, start: string, x: string, y: string) =>
      `${start}${x} ${Number(y) === 0 ? '0' : `-${y}`}px`,
  );
}
