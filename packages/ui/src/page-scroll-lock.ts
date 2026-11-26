/** Natively a window is its own screen layer; the page behind cannot be scrolled by it. */
export function lockPageScroll(): () => void {
  return () => undefined;
}
