// Scrolling something into view without moving anything else (spec 0033, REQ-004). The browser's
// scrollIntoView scrolls every scrolling ancestor, the page itself included; this only scrolls
// the nearest scroll area, and only when the item is not fully visible in it.

export interface Band {
  top: number;
  bottom: number;
}

/**
 * The scroll offset that shows `item` in `view` (both in window coordinates), or null when it is
 * fully visible already. `start` brings its top to the top of the view; `nearest` scrolls only as
 * far as needed.
 */
export function revealScrollTop(input: {
  item: Band;
  view: Band;
  scrollTop: number;
  align: 'start' | 'nearest';
}): number | null {
  const { item, view, scrollTop } = input;
  if (item.top >= view.top && item.bottom <= view.bottom) return null;
  const toTop = scrollTop + item.top - view.top;
  const tall = item.bottom - item.top > view.bottom - view.top;
  if (input.align === 'start' || item.top < view.top || tall) return Math.max(0, toTop);
  return Math.max(0, scrollTop + item.bottom - view.bottom);
}

function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (parent === document.body || parent === document.documentElement) return null;
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll') return parent;
  }
  return null;
}

/** Scrolls the nearest scroll area around `node` so it is visible; the page stays where it is. */
export function revealInScrollParent(
  node: unknown,
  options: { align: 'start' | 'nearest'; smooth?: boolean },
): void {
  if (typeof document === 'undefined' || !(node instanceof HTMLElement)) return;
  const parent = scrollParent(node);
  if (!parent) return;
  const top = revealScrollTop({
    item: node.getBoundingClientRect(),
    view: parent.getBoundingClientRect(),
    scrollTop: parent.scrollTop,
    align: options.align,
  });
  if (top === null) return;
  parent.scrollTo({ top, behavior: options.smooth ? 'smooth' : 'auto' });
}
