// Decisions of a horizontal swipe, e.g. the day window's week strip (spec 0016, REQ-006). Pure, so
// the thresholds are tested in Node; the component only feeds in PanResponder's numbers.

/** Movement (px) from which a release counts as a swipe. */
const SWIPE_DISTANCE = 48;
/** A shorter move still counts when released this fast (px/ms). */
const FLICK_VELOCITY = 0.4;
const FLICK_DISTANCE = 16;
/** The move must start this far sideways and run mostly sideways before the swipe takes over. */
const CLAIM_DISTANCE = 10;
const CLAIM_RATIO = 2;

/** +1 for a swipe to the left (next), -1 to the right (previous), 0 for no swipe. */
export function swipeStep(dx: number, vx: number): -1 | 0 | 1 {
  const far = Math.abs(dx) >= SWIPE_DISTANCE;
  const flick = Math.abs(dx) >= FLICK_DISTANCE && Math.abs(vx) >= FLICK_VELOCITY;
  if (!far && !flick) return 0;
  return dx < 0 ? 1 : -1;
}

/** Whether a move (dx, dy so far) runs clearly sideways, so the swipe takes it from scrolling. */
export function claimsSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) >= CLAIM_DISTANCE && Math.abs(dx) >= CLAIM_RATIO * Math.abs(dy);
}
