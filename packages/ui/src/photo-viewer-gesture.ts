// The swipe that closes the full-screen photo (spec 0036, REQ-009): pure, so it is tested in Node.

/** Share of the screen height a slow swipe down must travel to close. */
const CLOSE_SHARE = 0.2;
/** A flick down this fast (points per ms) closes from any distance. */
const CLOSE_VELOCITY = 0.8;
/** Upwards the photo only gives a little, so it is clear that way closes nothing. */
const UP_RESISTANCE = 0.2;

/** Whether letting go after a drag of `dy` at speed `vy` closes the viewer. */
export function closesViewer(release: { dy: number; vy: number }, screenHeight: number): boolean {
  if (release.dy <= 0) return false;
  return release.dy > screenHeight * CLOSE_SHARE || release.vy > CLOSE_VELOCITY;
}

/** How far the photo moves for a drag of `dy`: 1:1 down, with resistance up. */
export function viewerDrag(dy: number): number {
  return dy >= 0 ? dy : dy * UP_RESISTANCE;
}
