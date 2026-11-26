const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

/**
 * Spec 0029, REQ-001 for a window whose page removes it while open (`{open ? <…Sheet/> : null}`):
 * React drops it at once, so an inert copy of its layer takes its place and fades out (or slides
 * down) instead of vanishing. Call it while the window is still on the page; a window that stays
 * (React's StrictMode remount) leaves no copy.
 *
 * @public Metro resolves the import of the native twin to this file on the web.
 */
export function fadeOutCopy(node: unknown, options: { slide: boolean; ms: number }): void {
  if (typeof document === 'undefined' || !(node instanceof HTMLElement)) return;
  let layer = node;
  while (layer.parentElement && layer.parentElement !== document.body) layer = layer.parentElement;
  if (layer.parentElement !== document.body) return;
  const copy = layer.cloneNode(true) as HTMLElement;
  const next = layer.nextSibling;
  // A window dragged down (spec 0033) leaves from where the finger left it.
  const place = layer.querySelector<HTMLElement>('[data-sheet-part="panel"]')?.style.transform;
  const from = place && place !== 'none' ? place : 'translateY(0px)';
  queueMicrotask(() => {
    if (node.isConnected) return;
    copy.setAttribute('inert', '');
    copy.setAttribute('aria-hidden', 'true');
    copy.setAttribute('data-sheet-exit', '');
    copy.style.pointerEvents = 'none';
    copy.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
    // No longer a window: Escape handlers and focus traps look for [aria-modal].
    copy
      .querySelectorAll('[aria-modal]')
      .forEach((element) => element.removeAttribute('aria-modal'));
    copy.querySelectorAll('[role="dialog"]').forEach((element) => element.removeAttribute('role'));
    // In the window's own place among the layers: one opened since then stays above the copy.
    const anchor = layer.isConnected ? layer : next?.isConnected ? next : null;
    document.body.insertBefore(copy, anchor);
    const timing = { duration: options.ms, easing: EASE_OUT, fill: 'forwards' as const };
    const scrim = copy.querySelector<HTMLElement>('[data-sheet-part="scrim"]');
    const panel = copy.querySelector<HTMLElement>('[data-sheet-part="panel"]');
    if (typeof copy.animate === 'function') {
      scrim?.animate([{ opacity: 1 }, { opacity: 0 }], timing);
      panel?.animate(
        options.slide
          ? [{ transform: from }, { transform: `${from} translateY(${panel.offsetHeight}px)` }]
          : [{ opacity: 1 }, { opacity: 0 }],
        timing,
      );
    }
    setTimeout(() => copy.remove(), options.ms + 50);
  });
}
