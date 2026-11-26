import { useEffect, useEffectEvent, type RefObject } from 'react';

import { releaseVelocity, sheetDragClaim, type DragSample } from './sheet-drag';

export interface SheetDragHandlers {
  /** The finger took the window: stop what it is doing. */
  onStart: () => void;
  /** The finger moved `dy` from where it touched (down positive). */
  onMove: (dy: number) => void;
  /** Let go after moving `dy`, at `velocity` px/ms; `height` is the window's. */
  onRelease: (dy: number, velocity: number, height: number) => void;
}

/** Something inside that owns the finger itself (a drag handle, a slider) keeps it. */
function ownsTouch(target: EventTarget | null, panel: HTMLElement): boolean {
  for (let node = target instanceof Element ? target : null; node && node !== panel;) {
    if (getComputedStyle(node).touchAction === 'none' && node.closest('[data-sheet-head]') === null)
      return true;
    node = node.parentElement;
  }
  return false;
}

function point(event: TouchEvent): { x: number; y: number } | null {
  const touch = event.touches[0];
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
}

/**
 * A phone window follows the finger down (spec 0033, REQ-001). Touch events of the browser, not
 * the responder system: only a listener on the element itself may stop the browser from
 * scrolling, and it has to decide on the first move (AC-003).
 *
 * @public Metro resolves the import of the native twin to this file on the web.
 */
export function useSheetDrag(
  enabled: boolean,
  refs: { panel: RefObject<unknown>; content: RefObject<unknown> },
  handlers: SheetDragHandlers,
): void {
  const start = useEffectEvent(() => handlers.onStart());
  const move = useEffectEvent((dy: number) => handlers.onMove(dy));
  const release = useEffectEvent((dy: number, velocity: number, height: number) =>
    handlers.onRelease(dy, velocity, height),
  );
  const { panel: panelRef, content: contentRef } = refs;
  useEffect(() => {
    const panel = panelRef.current;
    const content = contentRef.current;
    if (!enabled || !(panel instanceof HTMLElement)) return;
    let gesture: {
      from: 'header' | 'content';
      x: number;
      y: number;
      phase: 'undecided' | 'drag' | 'native';
      samples: DragSample[];
      dy: number;
      height: number;
    } | null = null;

    const onTouchStart = (event: TouchEvent) => {
      const at = point(event);
      if (event.touches.length !== 1 || !at || ownsTouch(event.target, panel)) {
        gesture = null;
        return;
      }
      const inContent =
        content instanceof HTMLElement &&
        event.target instanceof Node &&
        content.contains(event.target);
      gesture = {
        from: inContent ? 'content' : 'header',
        ...at,
        phase: 'undecided',
        samples: [{ y: at.y, t: event.timeStamp }],
        dy: 0,
        height: panel.getBoundingClientRect().height,
      };
    };
    const onTouchMove = (event: TouchEvent) => {
      const at = point(event);
      if (!gesture || !at || gesture.phase === 'native') return;
      const dx = at.x - gesture.x;
      const dy = at.y - gesture.y;
      if (gesture.phase === 'undecided') {
        const scrollTop = content instanceof HTMLElement ? content.scrollTop : 0;
        gesture.phase = sheetDragClaim({ from: gesture.from, dx, dy, scrollTop });
        if (gesture.phase !== 'drag') return;
        start();
      }
      event.preventDefault();
      gesture.dy = dy;
      gesture.samples.push({ y: at.y, t: event.timeStamp });
      if (gesture.samples.length > 12) gesture.samples.shift();
      move(dy);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!gesture || event.touches.length > 0) return;
      const done = gesture;
      gesture = null;
      if (done.phase !== 'drag') return;
      // A finger that rested before letting go: the time since its last move counts.
      const samples = [...done.samples, { y: done.samples.at(-1)?.y ?? 0, t: event.timeStamp }];
      release(done.dy, releaseVelocity(samples), done.height);
    };

    panel.addEventListener('touchstart', onTouchStart, { passive: true });
    panel.addEventListener('touchmove', onTouchMove, { passive: false });
    panel.addEventListener('touchend', onTouchEnd);
    panel.addEventListener('touchcancel', onTouchEnd);
    return () => {
      panel.removeEventListener('touchstart', onTouchStart);
      panel.removeEventListener('touchmove', onTouchMove);
      panel.removeEventListener('touchend', onTouchEnd);
      panel.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [enabled, panelRef, contentRef]);
}
