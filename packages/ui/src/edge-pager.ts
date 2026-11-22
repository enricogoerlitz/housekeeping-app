// What a drag does at the edges of the view (spec 0016, REQ-002, plan decision 4): it scrolls
// along in the bands at the top and bottom and turns the page in zones left and right. Pure, with
// time and positions as inputs, so the caller drives it from its frame loop and it is tested in
// Node.

/** Height of the bands at the top and bottom that scroll along. */
export const AUTO_SCROLL_BAND = 64;
/** Pixels per second at the very edge; the speed falls off linearly across the band. */
export const AUTO_SCROLL_MAX_SPEED = 1200;
/** The paging zones keep clear of the system back gesture at the screen edge. */
export const EDGE_ZONE_INSET = 20;
/** Width of a paging zone, at least a touch target. */
export const EDGE_ZONE_WIDTH = 48;
/** Holding in a zone this long turns the first page … */
export const EDGE_FIRST_PAGE_MS = 600;
/** … and then one more page each this often. */
export const EDGE_REPEAT_PAGE_MS = 900;

export interface Viewport {
  width: number;
  height: number;
}

/** Scroll speed in pixels per second for the pointer's y: negative scrolls up, 0 outside the bands. */
export function autoScrollSpeed(y: number, viewport: Viewport): number {
  const fromTop = y;
  const fromBottom = viewport.height - y;
  if (fromTop < AUTO_SCROLL_BAND && fromTop <= fromBottom) {
    return -AUTO_SCROLL_MAX_SPEED * depth(fromTop);
  }
  if (fromBottom < AUTO_SCROLL_BAND) return AUTO_SCROLL_MAX_SPEED * depth(fromBottom);
  return 0;
}

/** 1 at (or beyond) the edge, falling to 0 at the inner end of the band. */
function depth(distanceToEdge: number): number {
  return Math.min(1, 1 - distanceToEdge / AUTO_SCROLL_BAND);
}

export type EdgeZone = 'previous' | 'next';

/** The paging zone under the pointer's x, or null (also within the outermost 20 px). */
export function edgeZoneAt(x: number, viewport: Viewport): EdgeZone | null {
  const inZone = (distanceToEdge: number) =>
    distanceToEdge >= EDGE_ZONE_INSET && distanceToEdge < EDGE_ZONE_INSET + EDGE_ZONE_WIDTH;
  if (inZone(x)) return 'previous';
  if (inZone(viewport.width - x)) return 'next';
  return null;
}

export interface EdgePagerState {
  zone: EdgeZone | null;
  /** When the next page turns while the pointer stays in the zone. */
  nextPageAt: number;
}

export const EDGE_PAGER_IDLE: EdgePagerState = { zone: null, nextPageAt: 0 };

export interface EdgePagerStep {
  state: EdgePagerState;
  /** -1 a page back, 1 a page forward, 0 none. */
  page: -1 | 0 | 1;
}

/** One sample of the pointer during a drag. Leaving a zone, or entering the other, starts over. */
export function edgePagerStep(
  state: EdgePagerState,
  sample: { x: number; time: number; viewport: Viewport },
): EdgePagerStep {
  const zone = edgeZoneAt(sample.x, sample.viewport);
  if (zone === null) return { state: EDGE_PAGER_IDLE, page: 0 };
  if (zone !== state.zone) {
    return { state: { zone, nextPageAt: sample.time + EDGE_FIRST_PAGE_MS }, page: 0 };
  }
  if (sample.time < state.nextPageAt) return { state, page: 0 };
  return {
    state: { zone, nextPageAt: sample.time + EDGE_REPEAT_PAGE_MS },
    page: zone === 'next' ? 1 : -1,
  };
}
