// Spec 0067 (preview feedback 28.11.): in a chat, dragging the messages down (to read further up)
// sends the keyboard away. A web app cannot follow the finger like iOS's interactive dismiss, so
// the keyboard goes as soon as the drag clearly starts downwards; the page itself keeps scrolling
// with the finger (use-drag-dismiss.ts).

const DISMISS_AFTER = 12;

type Point = { x: number; y: number };

export function dragDismissesKeyboard(start: Point, now: Point, keyboardOpen: boolean): boolean {
  const dy = now.y - start.y;
  return keyboardOpen && dy > DISMISS_AFTER && dy > Math.abs(now.x - start.x);
}
