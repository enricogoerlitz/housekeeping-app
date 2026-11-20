// Fixed window sizes (spec 0005, REQ-003). Pure geometry, so the sizes are tested in Node.

/** Below this window width the app uses the phone layout (tab bar, sheets from below). */
export const PHONE_MAX_WIDTH = 700;

/**
 * s = confirm or pick one of a few (height follows the content); m = forms; l = search and pick
 * with tabs. m and l keep their height whatever they show.
 */
export type SheetSize = 's' | 'm' | 'l';

export interface SheetFrame {
  width?: number;
  height?: number;
  maxHeight: number;
}

const WIDE = { s: { width: 440 }, m: { width: 560, height: 640 }, l: { width: 760, height: 720 } };
const EDGE_GAP = 16;

export function sheetFrame(size: SheetSize, window: { width: number; height: number }): SheetFrame {
  if (window.width < PHONE_MAX_WIDTH) {
    if (size === 's') return { maxHeight: Math.round(window.height * 0.5) };
    const height = Math.round(window.height * 0.9);
    return { height, maxHeight: height };
  }
  const maxHeight = Math.round(window.height * 0.85);
  const width = Math.min(WIDE[size].width, window.width - 2 * EDGE_GAP);
  if (size === 's') return { width, maxHeight };
  const height = Math.min(WIDE[size].height, maxHeight);
  return { width, height, maxHeight: height };
}
