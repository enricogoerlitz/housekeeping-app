import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDragDismissKeyboard } from './use-drag-dismiss';

function Chat() {
  useDragDismissKeyboard(false);
  return null;
}

// Composer polish 28.11. (spec 0067): a drag on a short chat pulled the whole page — header and
// input — down with the finger on iPhone; while a chat is shown the page itself never bounces.
describe('useDragDismissKeyboard', () => {
  it('turns the page bounce off while the chat is shown and restores it afterwards', () => {
    document.body.style.overscrollBehavior = 'auto';
    const { unmount } = render(<Chat />);
    expect(document.documentElement.style.overscrollBehavior).toBe('none');
    expect(document.body.style.overscrollBehavior).toBe('none');
    unmount();
    expect(document.documentElement.style.overscrollBehavior).toBe('');
    expect(document.body.style.overscrollBehavior).toBe('auto');
  });
});
