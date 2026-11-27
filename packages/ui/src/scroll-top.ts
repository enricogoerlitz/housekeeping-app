import { useEffect, useRef } from 'react';

// A second tap on the active tab scrolls its page to the top (spec 0057, REQ-002). The tab bar
// does not know the page's scroll area: every scrolling page (Screen, InfiniteList) registers
// here, and the one that is shown answers. Tabs and pages below a stack stay mounted, but hidden
// (display: none), so they have no boxes and are left where they are.

export interface TopScroller {
  /** The scroll area's element, to tell whether it is shown. */
  node: () => unknown;
  toTop: (animated: boolean) => void;
}

const scrollers = new Set<TopScroller>();

export function registerTopScroller(scroller: TopScroller): () => void {
  scrollers.add(scroller);
  return () => scrollers.delete(scroller);
}

/** Shown on the screen: it has a box. Where nothing can be measured (native), every one counts. */
export function isShown(node: unknown): boolean {
  if (node === null || node === undefined) return false;
  const rects = (node as { getClientRects?: () => ArrayLike<unknown> }).getClientRects;
  return typeof rects === 'function' ? rects.call(node).length > 0 : true;
}

/** Scrolls the shown page to the top; how many scroll areas moved. */
export function scrollShownToTop(animated: boolean): number {
  let moved = 0;
  for (const scroller of scrollers) {
    if (!isShown(scroller.node())) continue;
    scroller.toTop(animated);
    moved += 1;
  }
  return moved;
}

/** The DOM element behind a scroll view's ref on the web; the ref itself elsewhere. */
export function scrollableNode(ref: unknown): unknown {
  const view = ref as { getScrollableNode?: () => unknown } | null;
  return view?.getScrollableNode?.() ?? view;
}

/** Registers a page's scroll area while it is mounted; `enabled` false for a preview. */
export function useTopScroller(scroller: TopScroller, enabled = true): void {
  const latest = useRef(scroller);
  useEffect(() => {
    latest.current = scroller;
  });
  useEffect(() => {
    if (!enabled) return undefined;
    return registerTopScroller({
      node: () => latest.current.node(),
      toTop: (animated) => latest.current.toTop(animated),
    });
  }, [enabled]);
}
