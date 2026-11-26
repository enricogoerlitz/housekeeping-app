// Spec 0034, REQ-003, decision 2: in the installed iOS web app a swipe from the screen edge goes
// back (or forward) in the browser history with its own animation; the app's stack must then not
// slide a second time. Pure, so the decision is tested in Node; the app feeds in the window's
// touch and popstate events.

/** A touch starting this close to the left or right screen edge may be the system's swipe. */
const EDGE = 24;
/** Sideways way from which an edge touch is a swipe, not a tap (e.g. on "‹ Essen"). */
const SWIPE_DISTANCE = 10;

export type EdgeSwipeSignal =
  | { type: 'touchstart'; x: number; width: number }
  | { type: 'touchmove'; x: number }
  | { type: 'touchend' }
  | { type: 'touchcancel' }
  | { type: 'popstate' };

export interface EdgeSwipeState {
  /** Where the last touch started, if at a screen edge. */
  edgeStart?: number;
  /** That touch turned into a swipe: it moved sideways or the system took it over (cancel). */
  swiped: boolean;
  /** The history changed since that touch began. */
  popstate: boolean;
}

export const EDGE_SWIPE_START: EdgeSwipeState = { swiped: false, popstate: false };

export function nextEdgeSwipe(state: EdgeSwipeState, signal: EdgeSwipeSignal): EdgeSwipeState {
  switch (signal.type) {
    case 'touchstart': {
      const atEdge = signal.x <= EDGE || signal.x >= signal.width - EDGE;
      return { edgeStart: atEdge ? signal.x : undefined, swiped: false, popstate: false };
    }
    case 'touchmove':
      if (state.edgeStart === undefined || state.swiped) return state;
      return Math.abs(signal.x - state.edgeStart) >= SWIPE_DISTANCE
        ? { ...state, swiped: true }
        : state;
    case 'touchcancel':
      return state.edgeStart === undefined ? state : { ...state, swiped: true };
    case 'touchend':
      return state;
    case 'popstate':
      return { ...state, popstate: true };
  }
}

/**
 * Whether the page change happening now comes from the system's edge swipe: the last touch began
 * at an edge, became a swipe, and the history changed since. The app's own Back is a tap.
 */
export function systemSwipeNavigation(state: EdgeSwipeState): boolean {
  return state.edgeStart !== undefined && state.swiped && state.popstate;
}
