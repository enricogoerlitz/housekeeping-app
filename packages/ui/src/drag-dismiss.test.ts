import { describe, expect, it } from 'vitest';

import { dragDismissesKeyboard } from './drag-dismiss';

// Spec 0067 (preview feedback 28.11.): dragging the chat down to read sends the keyboard away, as
// close to iOS's interactive dismiss as the browser allows.
describe('dragDismissesKeyboard', () => {
  const start = { x: 100, y: 300 };
  it('a downward drag of more than 12 pt with the keyboard open dismisses it', () => {
    expect(dragDismissesKeyboard(start, { x: 104, y: 316 }, true)).toBe(true);
  });
  it('a short wobble, an upward drag or a sideways swipe does not', () => {
    expect(dragDismissesKeyboard(start, { x: 100, y: 308 }, true)).toBe(false);
    expect(dragDismissesKeyboard(start, { x: 100, y: 250 }, true)).toBe(false);
    expect(dragDismissesKeyboard(start, { x: 160, y: 320 }, true)).toBe(false);
  });
  it('without a keyboard there is nothing to dismiss', () => {
    expect(dragDismissesKeyboard(start, { x: 100, y: 400 }, false)).toBe(false);
  });
});
