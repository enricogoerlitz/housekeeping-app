// Sizes and snapping of the docked panel (spec 0016, REQ-006 "Tages-Fenster"). Pure geometry, so
// the gesture's decisions are tested in Node; the component only feeds in measured numbers.

/** The phone sizes of the panel; `collapsed` shows only the handle and the header line. */
export type DockedPanelState = 'collapsed' | 'half' | 'full';
/** Where a release can land: a size, or closed. */
export type PanelSnap = DockedPanelState | 'closed';

export interface PanelHeights {
  collapsed: number;
  half: number;
  full: number;
}

/** Release speed (px/ms, as PanResponder reports it) from which a release counts as a flick. */
export const FLICK_VELOCITY = 0.5;
/** Movement (px) up to which a press on the handle is a tap, not a drag. */
const TAP_SLOP = 6;
/** How far the panel can be pulled past full height, and how stiff that feels. */
const RUBBER_LIMIT = 40;
const RUBBER_STIFFNESS = 0.55;
const SIDE_MIN = 320;
const SIDE_MAX = 400;
const SIDE_SHARE = 0.3;

/**
 * Heights in the space between the top of the screen area and its bottom edge (the tab bar):
 * full keeps `topGap` free, half is half of the area, collapsed is the measured header line.
 */
export function panelHeights(input: {
  container: number;
  topGap: number;
  collapsed: number;
}): PanelHeights {
  const full = Math.max(input.container - input.topGap, Math.min(input.collapsed, input.container));
  const collapsed = Math.min(input.collapsed, full);
  const half = Math.min(full, Math.max(collapsed, Math.round(input.container / 2)));
  return { collapsed, half, full };
}

export function snapHeight(snap: PanelSnap, heights: PanelHeights): number {
  return snap === 'closed' ? 0 : heights[snap];
}

/** Height while the handle is dragged by `dy` (down = positive); past full it rubber-bands. */
export function dragHeight(start: number, dy: number, full: number): number {
  const height = Math.max(0, start - dy);
  if (height <= full) return height;
  const excess = height - full;
  return full + RUBBER_LIMIT * (1 - 1 / ((excess * RUBBER_STIFFNESS) / RUBBER_LIMIT + 1));
}

export function isTap(dx: number, dy: number): boolean {
  return Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP;
}

/**
 * Where the panel lands on release. A flick (fast, either direction) goes to the next snap point
 * in its direction; otherwise the nearest one wins. Collapsed is a snap point only while the
 * panel is collapsed (the feature asks for it during a drag); from half, down means close.
 */
export function snapPanel(input: {
  from: DockedPanelState;
  height: number;
  /** px/ms, down = positive. */
  velocity: number;
  heights: PanelHeights;
}): PanelSnap {
  const { height, velocity, heights } = input;
  const candidates: PanelSnap[] =
    input.from === 'collapsed'
      ? ['closed', 'collapsed', 'half', 'full']
      : ['closed', 'half', 'full'];
  const at = (snap: PanelSnap) => snapHeight(snap, heights);
  if (Math.abs(velocity) > FLICK_VELOCITY) {
    if (velocity < 0) return candidates.find((snap) => at(snap) > height) ?? 'full';
    return [...candidates].reverse().find((snap) => at(snap) < height) ?? 'closed';
  }
  let best: PanelSnap = 'closed';
  for (const snap of candidates) {
    if (Math.abs(at(snap) - height) < Math.abs(at(best) - height)) best = snap;
  }
  return best;
}

/** A tap on the handle: collapsed and half grow one size, full goes back to half. */
export function tapPanel(state: DockedPanelState): DockedPanelState {
  return state === 'half' ? 'full' : 'half';
}

/** One step from the keyboard or a screen reader; down from half or collapsed closes. */
export function stepPanel(state: DockedPanelState, direction: 'up' | 'down'): PanelSnap {
  if (direction === 'up') return state === 'collapsed' ? 'half' : 'full';
  return state === 'full' ? 'half' : 'closed';
}

/** Width of the panel beside the content from 700 px: about 30 % of the window, 320–400 px. */
export function sidePanelWidth(windowWidth: number): number {
  return Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.round(windowWidth * SIDE_SHARE)));
}
