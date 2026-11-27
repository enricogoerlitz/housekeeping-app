// Paging of the media gallery (spec 0046, REQ-003). Pure, so the rules are tested in Node; the
// component feeds in the scroll position and its width.

const clamp = (index: number, count: number) => Math.max(0, Math.min(count - 1, index));

/** The page nearest to the scroll position `offset` of pages `width` wide. */
export function pageAt(offset: number, width: number, count: number): number {
  if (width <= 0 || count <= 0) return 0;
  return clamp(Math.round(offset / width), count);
}

/** One page further (`delta` 1) or back (-1), never past the first or the last. */
export function stepPage(index: number, delta: number, count: number): number {
  return clamp(clamp(index, count) + delta, count);
}

/** The page step of a key: → next, ← previous, anything else none. */
export function galleryKeyStep(key: string): -1 | 0 | 1 {
  if (key === 'ArrowRight') return 1;
  if (key === 'ArrowLeft') return -1;
  return 0;
}
