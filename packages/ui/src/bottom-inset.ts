// Pure, so it is tested in Node; `useBottomInset` in `shell.tsx` feeds in the safe area.

/**
 * Extra room above the home bar (spec 0029, REQ-002): with the safe area alone, labels and buttons
 * at the bottom still sit in the rounded corners of the screen. One step of the spacing scale.
 */
export const HOME_BAR_GAP = 8;

/**
 * The distance from the bottom edge for anything that sits at the bottom: the safe area plus the
 * gap on devices with a home bar, else `minimum` (no home bar, nothing changes).
 */
export function bottomInset(safeAreaBottom: number, minimum = 0): number {
  return safeAreaBottom > 0 ? safeAreaBottom + HOME_BAR_GAP : minimum;
}
